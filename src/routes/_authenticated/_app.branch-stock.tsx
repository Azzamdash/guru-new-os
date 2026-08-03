import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Store, Plus, Minus, PackagePlus, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  listOfflineBranches,
  listBranchStock,
  addBranchStockMovement,
  listBranchStockMovements,
} from "@/lib/branch-stock.functions";
import { useLang, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/branch-stock")({
  head: () => ({
    meta: [
      { title: tr("مخزون الفروع الأوفلاين — e-GURUS") },
      { name: "description", content: "إضافة وخصم مخزون منتجات الفروع الأوفلاين يدويًا." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();

  const branchesFn = useServerFn(listOfflineBranches);
  const stockFn = useServerFn(listBranchStock);
  const movesFn = useServerFn(listBranchStockMovements);

  const branchesQ = useQuery({ queryKey: ["offline-branches"], queryFn: () => branchesFn() });
  const [brandId, setBrandId] = useState<string>("");
  const activeBrand = brandId || branchesQ.data?.[0]?.id || "";

  const stockQ = useQuery({
    queryKey: ["branch-stock", activeBrand],
    queryFn: () => stockFn({ data: { brandId: activeBrand } }),
    enabled: !!activeBrand,
  });
  const movesQ = useQuery({
    queryKey: ["branch-stock-moves", activeBrand],
    queryFn: () => movesFn({ data: { brandId: activeBrand } }),
    enabled: !!activeBrand,
  });

  const [dialog, setDialog] = useState<null | {
    product_id: string;
    product_name: string;
    direction: "in" | "out";
  }>(null);

  const totals = useMemo(() => {
    const items = stockQ.data ?? [];
    let units = 0,
      value = 0;
    for (const p of items) {
      units += Number(p.on_hand_qty || 0);
      value += Number(p.on_hand_qty || 0) * Number(p.moving_avg_cost || 0);
    }
    return { units, value, count: items.length };
  }, [stockQ.data]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Store className="w-7 h-7 text-primary" />
            {T(tr("مخزون الفروع الأوفلاين"), "Offline Branches Stock")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              tr("أضِف مخزون لمنتجات الفرع يدويًا. البيع من POS بيخصم تلقائيًا."),
              "Add branch stock manually. POS sales auto-deduct.",
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2" disabled={!activeBrand}>
          <Link
            to="/reports/inventory-valuation"
            search={{ brandId: "", branchId: activeBrand || "", year: new Date().getFullYear() }}
          >
            <Layers className="w-4 h-4" /> {T(tr("تقارير المخزون"), "Inventory Reports")}
          </Link>
        </Button>
      </div>

      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">{T(tr("الفرع"), "Branch")}</Label>
          <Select value={activeBrand} onValueChange={setBrandId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={T(tr("اختر فرع"), "Select branch")} />
            </SelectTrigger>
            <SelectContent>
              {(branchesQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ms-auto flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">{T(tr("عدد المنتجات"), "Products")}: </span>
            <b>{totals.count}</b>
          </div>
          <div>
            <span className="text-muted-foreground">{T(tr("إجمالي القطع"), "Units")}: </span>
            <b>{totals.units.toLocaleString("en-US")}</b>
          </div>
          <div>
            <span className="text-muted-foreground">{T(tr("قيمة المخزون"), "Stock value")}: </span>
            <b>{totals.value.toLocaleString("en-US", { maximumFractionDigits: 2 })} EGP</b>
          </div>
        </div>
      </Card>

      <Card className="card-gradient p-4 md:p-5 space-y-3">
        <h3 className="font-semibold">{T(tr("المنتجات"), "Products")}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-2 text-start">{T(tr("المنتج"), "Product")}</th>
                <th className="p-2">SKU</th>
                <th className="p-2">{T(tr("الوحدة"), "Unit")}</th>
                <th className="p-2">{T(tr("المخزون الحالي"), "On-hand")}</th>
                <th className="p-2">{T(tr("متوسط التكلفة"), "Avg cost")}</th>
                <th className="p-2">{T(tr("سعر البيع"), "Sell price")}</th>
                <th className="p-2 text-end">{T(tr("إجراء"), "Action")}</th>
              </tr>
            </thead>
            <tbody>
              {(stockQ.data ?? []).map((p) => {
                const low = Number(p.on_hand_qty || 0) <= 0;
                return (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 font-mono text-xs">{p.sku ?? "—"}</td>
                    <td className="p-2">{p.unit}</td>
                    <td className="p-2">
                      <Badge variant={low ? "destructive" : "secondary"}>
                        {Number(p.on_hand_qty || 0).toLocaleString("en-US")}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {Number(p.moving_avg_cost || 0).toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2">
                      {Number(p.sell_price || 0).toLocaleString("en-US", {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2 text-end">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            setDialog({ product_id: p.id, product_name: p.name, direction: "in" })
                          }
                        >
                          <Plus className="w-3.5 h-3.5 me-1" /> {T(tr("إضافة"), "Add")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDialog({ product_id: p.id, product_name: p.name, direction: "out" })
                          }
                        >
                          <Minus className="w-3.5 h-3.5 me-1" /> {T(tr("خصم"), "Deduct")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {(!stockQ.data || stockQ.data.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    {T(tr("لا توجد منتجات في هذا الفرع."), "No products in this branch.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="card-gradient p-4 md:p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <PackagePlus className="w-4 h-4" /> {T(tr("آخر حركات المخزون"), "Recent stock movements")}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-right text-muted-foreground">
                <th className="p-2 text-start">{T(tr("التاريخ"), "Date")}</th>
                <th className="p-2 text-start">{T(tr("المنتج"), "Product")}</th>
                <th className="p-2">{T(tr("النوع"), "Type")}</th>
                <th className="p-2">{T(tr("الكمية"), "Qty")}</th>
                <th className="p-2 text-start">{T(tr("ملاحظة"), "Note")}</th>
              </tr>
            </thead>
            <tbody>
              {(movesQ.data ?? []).map((m) => {
                const isIn = m.type === "production" || m.type === "return";
                return (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="p-2">{new Date(m.occurred_at).toLocaleString("en-US")}</td>
                    <td className="p-2">{m.product_name}</td>
                    <td className="p-2">
                      <Badge variant={isIn ? "secondary" : "outline"}>
                        {isIn ? T(tr("إضافة"), "In") : T(tr("خصم/بيع"), "Out")}
                      </Badge>
                    </td>
                    <td className="p-2">{Number(m.qty || 0).toLocaleString("en-US")}</td>
                    <td className="p-2 max-w-[300px] truncate">{m.note ?? "—"}</td>
                  </tr>
                );
              })}
              {(!movesQ.data || movesQ.data.length === 0) && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {T(tr("لا توجد حركات."), "No movements.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {dialog && (
        <MoveDialog
          brandId={activeBrand}
          product_id={dialog.product_id}
          product_name={dialog.product_name}
          direction={dialog.direction}
          onClose={() => setDialog(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["branch-stock", activeBrand] });
            qc.invalidateQueries({ queryKey: ["branch-stock-moves", activeBrand] });
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

function MoveDialog({
  brandId,
  product_id,
  product_name,
  direction,
  onClose,
  onDone,
}: {
  brandId: string;
  product_id: string;
  product_name: string;
  direction: "in" | "out";
  onClose: () => void;
  onDone: () => void;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const addFn = useServerFn(addBranchStockMovement);
  const mut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          product_id,
          direction,
          qty: Number(qty || 0),
          unit_cost: direction === "in" && cost ? Number(cost) : null,
          note: note || null,
        },
      }),
    onSuccess: () => {
      toast.success(T(tr("تم التحديث"), "Updated"));
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {direction === "in"
              ? T(`إضافة مخزون — ${product_name}`, `Add stock — ${product_name}`)
              : T(`خصم مخزون — ${product_name}`, `Deduct stock — ${product_name}`)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{T(tr("الكمية"), "Quantity")}</Label>
            <Input
              type="number"
              min={1}
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>
          {direction === "in" && (
            <div>
              <Label>{T(tr("تكلفة الوحدة (اختياري)"), "Unit cost (optional)")}</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {T(
                  tr("لو ادخلت التكلفة هيتحسب متوسط التكلفة تلقائيًا."),
                  "If entered, the moving-average cost updates automatically.",
                )}
              </p>
            </div>
          )}
          <div>
            <Label>{T(tr("ملاحظة"), "Note")}</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <input type="hidden" value={brandId} readOnly />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {T(tr("إلغاء"), "Cancel")}
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !qty || Number(qty) <= 0}>
            {T(tr("حفظ"), "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
