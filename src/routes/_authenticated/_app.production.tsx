import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Layers } from "lucide-react";
import { listProducts, listBrands, listInventoryMovements, upsertInventoryMovement, deleteInventoryMovement } from "@/lib/internal.functions";
import { listEmployees } from "@/lib/employees.functions";

export const Route = createFileRoute("/_authenticated/_app/production")({
  head: () => ({ meta: [
    { title: "الإنتاج والمخزون — e-GURUS" },
    { name: "description", content: "تسجيل الإنتاج وحركات المخزون لكل براند." },
  ]}),
  component: ProductionPage,
});

const TYPE_LABEL: Record<string, string> = { production: "إنتاج", sale: "بيع", return: "مرتجع", adjustment: "تسوية" };
const UNITS_LABEL: Record<string, string> = { piece: "قطعة", kg: "كجم", gram: "جم", liter: "لتر", meter: "متر" };

function ProductionPage() {
  const qc = useQueryClient();
  const listP = useServerFn(listProducts);
  const listB = useServerFn(listBrands);
  const listM = useServerFn(listInventoryMovements);
  const upM = useServerFn(upsertInventoryMovement);
  const delM = useServerFn(deleteInventoryMovement);
  const listE = useServerFn(listEmployees);
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => listP() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const movesQ = useQuery({ queryKey: ["inv-moves"], queryFn: () => listM({ data: { productId: null } }) });
  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listE() });

  const today = getTodayInBusinessTimezone();
  const [brandId, setBrandId] = useState("");
  const [form, setForm] = useState({ product_id: "", type: "production" as "production"|"sale"|"return"|"adjustment", qty: 1, occurred_at: today, note: "", worker_name: "", employee_id: "" });

  const products = productsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const employees = (empQ.data ?? []).filter((e) => e.active);
  const brandEmployees = brandId ? employees.filter((e) => e.brand_id === brandId) : employees;
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const filteredProducts = brandId ? products.filter((p) => p.brand_id === brandId && p.active) : products.filter((p) => p.active);
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "—";
  const productUnit = (id: string) => productById.get(id)?.unit ?? "";

  const save = useMutation({
    mutationFn: () => upM({ data: {
      ...form,
      note: form.note || null,
      employee_id: form.type === "production" ? (form.employee_id || null) : null,
      worker_name: form.type === "production" ? (form.worker_name || null) : null,
    } }),
    onSuccess: () => { toast.success("تم"); qc.invalidateQueries({ queryKey: ["inv-moves"] }); setForm({ ...form, qty: 1, note: "", worker_name: "", employee_id: "" }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delM({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inv-moves"] }),
  });

  const stockMap = new Map<string, number>();
  for (const m of (movesQ.data ?? []) as Array<{ product_id: string; type: string; qty: number }>) {
    const sign = m.type === "production" || m.type === "return" || m.type === "adjustment" ? 1 : -1;
    stockMap.set(m.product_id, (stockMap.get(m.product_id) ?? 0) + sign * Number(m.qty));
  }

  const visibleStockProducts = brandId ? products.filter((p) => p.brand_id === brandId) : products;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">الإنتاج والمخزون</h1>
          <p className="text-muted-foreground text-sm mt-1">اختر البراند ثم المنتج ثم أدخل الحركة.</p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link
            to="/reports/inventory-valuation"
            search={{ brandId: brandId || "", branchId: "", year: new Date().getFullYear() }}
          >
            <Layers className="w-4 h-4" /> تقارير المخزون {brandId ? `— ${brands.find((b) => b.id === brandId)?.name ?? ""}` : ""}
          </Link>
        </Button>
      </div>

      <Card className="card-gradient p-5">
        <div className="grid md:grid-cols-6 gap-3 items-end">
          <div>
            <Label>البراند</Label>
            <Select value={brandId} onValueChange={(v) => { setBrandId(v); setForm({ ...form, product_id: "" }); }}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>{brands.filter((b) => b.type === "product" && b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>المنتج</Label>
            <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })} disabled={!brandId}>
              <SelectTrigger><SelectValue placeholder={brandId ? "اختر" : "اختر البراند"} /></SelectTrigger>
              <SelectContent>{filteredProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {UNITS_LABEL[p.unit] ?? p.unit}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>النوع</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">إنتاج</SelectItem>
                <SelectItem value="sale">بيع</SelectItem>
                <SelectItem value="return">مرتجع</SelectItem>
                <SelectItem value="adjustment">تسوية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>الكمية {form.product_id ? `(${UNITS_LABEL[productUnit(form.product_id)] ?? ""})` : ""}</Label>
            <Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: parseFloat(e.target.value) || 0 })} />
          </div>
          <div><Label>التاريخ</Label><Input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></div>
        </div>
        <div className="mt-3 grid md:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
          <div>
            <Label>الموظف (للإنتاج)</Label>
            <Select value={form.employee_id || "none"} disabled={form.type !== "production"} onValueChange={(v) => {
              if (v === "none") { setForm({ ...form, employee_id: "", worker_name: "" }); return; }
              const emp = employees.find((e) => e.id === v);
              setForm({ ...form, employee_id: v, worker_name: emp?.name ?? "" });
            }}>
              <SelectTrigger><SelectValue placeholder={brandId ? "اختر" : "اختر البراند"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— يدوي —</SelectItem>
                {brandEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>اسم يدوي</Label><Input value={form.worker_name} onChange={(e) => setForm({ ...form, worker_name: e.target.value, employee_id: "" })} disabled={form.type !== "production" || !!form.employee_id} placeholder={form.type === "production" ? "اختياري" : "—"} /></div>
          <div><Label>ملاحظة</Label><Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          <Button onClick={() => save.mutate()} disabled={!form.product_id || form.qty <= 0 || save.isPending}>تسجيل</Button>
        </div>
      </Card>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-3">أرصدة المخزون {brandId ? `— ${brands.find((b) => b.id === brandId)?.name ?? ""}` : ""}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {visibleStockProducts.map((p) => (
            <div key={p.id} className="rounded border border-border p-3">
              <div className="text-xs text-muted-foreground truncate">{p.name}</div>
              <div className="text-2xl font-bold num mt-1">{(stockMap.get(p.id) ?? 0).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{UNITS_LABEL[p.unit] ?? p.unit}</div>
            </div>
          ))}
          {visibleStockProducts.length === 0 && <p className="text-sm text-muted-foreground col-span-full">لا منتجات.</p>}
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">آخر الحركات</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">التاريخ</th><th className="p-3">المنتج</th><th className="p-3">النوع</th>
            <th className="p-3 text-left">الكمية</th><th className="p-3">العامل</th><th className="p-3">ملاحظة</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {((movesQ.data ?? []) as Array<{ id: string; product_id: string; type: string; qty: number; occurred_at: string; note: string | null; worker_name: string | null }>).map((m) => (
              <tr key={m.id} className="border-b border-border/50">
                <td className="p-3 num" dir="ltr">{m.occurred_at}</td>
                <td className="p-3">{productName(m.product_id)}</td>
                <td className="p-3"><Badge variant={m.type === "production" ? "default" : m.type === "sale" ? "secondary" : "outline"}>{TYPE_LABEL[m.type]}</Badge></td>
                <td className="p-3 num text-left">{m.qty} {UNITS_LABEL[productUnit(m.product_id)] ?? ""}</td>
                <td className="p-3 text-muted-foreground">{m.worker_name ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{m.note ?? "—"}</td>
                <td className="p-3 text-left"><Button size="icon" variant="ghost" onClick={() => remove.mutate(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
