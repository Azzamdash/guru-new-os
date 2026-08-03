import { tr } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Check, Loader2 } from "lucide-react";
import { listOrders, getOrder, type OrderRow } from "@/lib/orders.functions";

export function OrderSearchCombobox({
  value,
  onSelect,
  className = "w-[340px]",
}: {
  value?: string;
  onSelect: (order: OrderRow) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<OrderRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const listOrdersFn = useServerFn(listOrders);
  const q = useQuery({
    queryKey: ["orders-center", "search", debounced],
    queryFn: () => listOrdersFn({ data: { search: debounced, days: 365, pageSize: 20 } }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const rows = useMemo(() => q.data?.rows ?? [], [q.data]);

  const getOrderFn = useServerFn(getOrder);
  const resolvedQ = useQuery({
    queryKey: ["orders-center", "resolve-order", value],
    queryFn: () => getOrderFn({ data: { id: value! } }),
    enabled: !!value && !selected,
    staleTime: 60_000,
  });

  const label = selected
    ? `${selected.customer_name ?? "بدون اسم"} — ${selected.external_order_number ?? selected.id.slice(0, 8)}`
    : value
      ? resolvedQ.data
        ? `${resolvedQ.data.customer_name ?? "بدون اسم"} — ${resolvedQ.data.external_order_number ?? value.slice(0, 8)}`
        : resolvedQ.isFetching
          ? "جارٍ التحميل…"
          : value
      : "ابحث باسم العميل أو رقم التليفون أو رقم الأوردر";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className={`${className} justify-between font-normal`}>
          <span className="truncate">{label}</span>
          <Search className="h-4 w-4 opacity-60 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={term} onValueChange={setTerm} placeholder={tr("اسم العميل / تليفون / رقم أوردر")} />
          <CommandList>
            {debounced.length < 2 ? (
              <div className="p-3 text-sm text-muted-foreground">{tr("اكتب حرفين على الأقل للبحث…")}</div>
            ) : q.isFetching ? (
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> {tr("جاري البحث…")}
              </div>
            ) : (
              <>
                <CommandEmpty>{tr("لا توجد نتائج مطابقة.")}</CommandEmpty>
                <CommandGroup>
                  {rows.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => {
                        setSelected(o);
                        onSelect(o);
                        setOpen(false);
                      }}
                      className="flex items-start gap-2"
                    >
                      {value === o.id ? <Check className="h-4 w-4 mt-1 shrink-0" /> : <span className="w-4 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{o.customer_name ?? "بدون اسم"}</span>
                          <Badge variant="secondary" className="shrink-0">{o.order_status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate" dir="ltr">
                          {o.customer_phone ?? "—"} · #{o.external_order_number ?? o.id.slice(0, 8)}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
