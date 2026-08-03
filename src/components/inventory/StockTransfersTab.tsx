import { tr } from "@/lib/i18n";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { listBrands, listProducts } from "@/lib/internal.functions";
import { transferStock, listStockTransfers } from "@/lib/inventory.functions";
import { useLang } from "@/lib/i18n";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function StockTransfersTab() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listB = useServerFn(listBrands);
  const listP = useServerFn(listProducts);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => listP() });

  const [fromBrand, setFromBrand] = useState("");
  const [fromProduct, setFromProduct] = useState("");
  const [toBrand, setToBrand] = useState("");
  const [toProduct, setToProduct] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [note, setNote] = useState("");

  const products = productsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const fromProducts = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.brand_id === fromBrand),
    [productsQ.data, fromBrand],
  );
  const toProducts = useMemo(
    () => (productsQ.data ?? []).filter((p) => p.brand_id === toBrand),
    [productsQ.data, toBrand],
  );
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";

  const transferFn = useServerFn(transferStock);
  const submit = useMutation({
    mutationFn: () =>
      transferFn({
        data: { fromProductId: fromProduct, toProductId: toProduct, qty, note: note || null },
      }),
    onSuccess: () => {
      toast.success(T("تم تنفيذ النقل", "Transfer completed"));
      setFromProduct("");
      setToProduct("");
      setQty(1);
      setNote("");
      qc.invalidateQueries({ queryKey: ["inventory-mgmt"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listFn = useServerFn(listStockTransfers);
  const transfersQ = useQuery({
    queryKey: ["inventory-mgmt", "transfers"],
    queryFn: () => listFn({ data: {} }),
  });

  const canSubmit = !!fromProduct && !!toProduct && fromProduct !== toProduct && qty > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{T("نقل المخزون", "Stock Transfer")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {T(
            "نقل كمية من منتج لمنتج تاني — بين براندين مختلفين أو بين فرعين لنفس البراند.",
            "Move a quantity from one product to another — between two different brands or between two branches of the same brand.",
          )}
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3 p-3 rounded-md border border-border/50">
            <div className="text-sm font-semibold">{T("من (المصدر)", "From (Source)")}</div>
            <div>
              <Label>{T("البراند", "Brand")}</Label>
              <Select
                value={fromBrand}
                onValueChange={(v) => {
                  setFromBrand(v);
                  setFromProduct("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر البراند", "Select brand")} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{T("المنتج", "Product")}</Label>
              <Select value={fromProduct} onValueChange={setFromProduct} disabled={!fromBrand}>
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر المنتج", "Select product")} />
                </SelectTrigger>
                <SelectContent>
                  {fromProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 p-3 rounded-md border border-border/50">
            <div className="text-sm font-semibold">{T("إلى (الوجهة)", "To (Destination)")}</div>
            <div>
              <Label>{T("البراند", "Brand")}</Label>
              <Select
                value={toBrand}
                onValueChange={(v) => {
                  setToBrand(v);
                  setToProduct("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر البراند", "Select brand")} />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{T("المنتج المقابل", "Matching Product")}</Label>
              <Select value={toProduct} onValueChange={setToProduct} disabled={!toBrand}>
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر المنتج", "Select product")} />
                </SelectTrigger>
                <SelectContent>
                  {toProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-[160px_1fr_auto] gap-3 items-end">
          <div>
            <Label>{T("الكمية", "Quantity")}</Label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>{T("ملاحظة (اختياري)", "Note (optional)")}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button
            onClick={() => submit.mutate()}
            disabled={!canSubmit || submit.isPending}
            className="gap-2"
          >
            <ArrowLeftRight className="w-4 h-4" /> {T("تنفيذ النقل", "Execute Transfer")}
          </Button>
        </div>
        {fromProduct && fromProduct === toProduct && (
          <p className="text-xs text-destructive">
            {T(
              "المصدر والوجهة لازم يكونوا منتجين مختلفين.",
              "The source and destination must be different products.",
            )}
          </p>
        )}
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("آخر عمليات النقل", "Recent Transfers")}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{T("التاريخ", "Date")}</th>
                <th className="p-3">{T("من", "From")}</th>
                <th className="p-3">{T("إلى", "To")}</th>
                <th className="p-3 text-left">{T("الكمية", "Quantity")}</th>
                <th className="p-3">{T("ملاحظة", "Note")}</th>
              </tr>
            </thead>
            <tbody>
              {(transfersQ.data ?? []).map((t) => (
                <tr key={t.transfer_group} className="border-b border-border/50">
                  <td className="p-3 num">{t.occurred_at}</td>
                  <td className="p-3">{t.from_product_name || productName(t.from_product_id)}</td>
                  <td className="p-3">{t.to_product_name || productName(t.to_product_id)}</td>
                  <td className="p-3 num text-left">{nf(t.qty)}</td>
                  <td className="p-3 text-muted-foreground">{t.note ?? "—"}</td>
                </tr>
              ))}
              {(transfersQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    {T("لا عمليات نقل مسجّلة بعد.", "No transfers recorded yet.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
