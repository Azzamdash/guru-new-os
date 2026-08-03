import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { listAssets, upsertAsset, deleteAsset, type CompanyAsset } from "@/lib/assets.functions";
import { listBrands } from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Lock, Building2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/assets")({
  head: () => ({
    meta: [
      { title: "أصول الشركة — e-GURUS" },
      { name: "description", content: "إدارة أصول الشركة والاهلاك السنوي لكل براند." },
    ],
  }),
  component: AssetsPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

function netBook(a: CompanyAsset) {
  const cost = Number(a.cost) || 0;
  const rate = Number(a.annual_depreciation_rate) || 0;
  const years = Math.max(0, (Date.now() - new Date(a.purchase_date).getTime()) / (365.25 * 24 * 3600 * 1000));
  const acc = Math.min(cost, cost * (rate / 100) * years);
  return Math.max(0, cost - acc);
}

function AssetsPage() {
  const qc = useQueryClient();
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: useServerFn(getMyRole) });
  const canWrite = !!(roleQ.data?.isAdmin || roleQ.data?.isManager || roleQ.data?.canWrite);
  const listFn = useServerFn(listAssets);
  const brandsFn = useServerFn(listBrands);
  const upsertFn = useServerFn(upsertAsset);
  const delFn = useServerFn(deleteAsset);

  const [brandFilter, setBrandFilter] = useState<string>("all");
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const assetsQ = useQuery({
    queryKey: ["assets", brandFilter],
    queryFn: () => listFn({ data: { brandId: brandFilter === "all" ? null : brandFilter === "company" ? null : brandFilter } }),
  });
  const rows = useMemo(() => {
    const all = assetsQ.data ?? [];
    if (brandFilter === "all") return all;
    if (brandFilter === "company") return all.filter((a) => !a.brand_id);
    return all.filter((a) => a.brand_id === brandFilter);
  }, [assetsQ.data, brandFilter]);

  const [editing, setEditing] = useState<Partial<CompanyAsset> | null>(null);
  const brandName = (id: string | null) => id ? (brandsQ.data ?? []).find((b) => b.id === id)?.name ?? "—" : "أصل عام للشركة";

  const totals = useMemo(() => {
    let cost = 0, net = 0, dep = 0;
    for (const a of rows) {
      const c = Number(a.cost) || 0;
      cost += c;
      net += netBook(a);
      dep += c * ((Number(a.annual_depreciation_rate) || 0) / 100);
    }
    return { cost, net, dep };
  }, [rows]);

  if (roleQ.data && !canWrite && !(roleQ.data?.isAdmin || roleQ.data?.isManager)) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold">{tr("لا تملك صلاحية عرض هذه الصفحة")}</h2>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="w-7 h-7 text-primary" /> أ{tr("أصول الشركة")}/h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("إدارة الأصول وحساب القيمة الدفترية بعد الإهلاك السنوي.")}</p>
        </div>
        {canWrite && (
          <Button className="gap-2" onClick={() => setEditing({ name: "", cost: 0, purchase_date: getTodayInBusinessTimezone(), annual_depreciation_rate: 20, brand_id: null, notes: "" })}>
            <Plus className="w-4 h-4" /> إ{tr("إضافة أصل")}          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={tr("عدد الأصول")} value={String(rows.length)} />
        <StatCard label={tr("إجمالي التكلفة")} value={fmt(totals.cost)} />
        <StatCard label={tr("القيمة الدفترية الحالية")} value={fmt(totals.net)} highlight />
        <StatCard label={tr("إهلاك سنوي متوقع")} value={fmt(totals.dep)} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Label className="text-sm">{tr("فلترة حسب البراند:")}</Label>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("كل الأصول")}</SelectItem>
            <SelectItem value="company">{tr("أصول عامة للشركة")}</SelectItem>
            {(brandsQ.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="card-gradient overflow-hidden">
        {assetsQ.isLoading ? (
          <div className="p-10 text-center text-muted-foreground">{tr("جارٍ التحميل…")}</div>
        ) : rows.length === 0 ? (
          <EmptyState title={tr("لا توجد أصول بعد")} description={tr("ابدأ بإضافة أول أصل لتتبع تكلفته والقيمة الدفترية بعد الإهلاك.")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-muted-foreground text-right border-b border-border">
                  <th className="p-3">{tr("الأصل")}</th>
                  <th className="p-3">{tr("البراند")}</th>
                  <th className="p-3">{tr("تاريخ الشراء")}</th>
                  <th className="p-3">{tr("التكلفة")}</th>
                  <th className="p-3">{tr("الإهلاك %")}</th>
                  <th className="p-3">{tr("القيمة الحالية")}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{a.name}{a.notes && <div className="text-xs text-muted-foreground">{a.notes}</div>}</td>
                    <td className="p-3"><Badge variant={a.brand_id ? "outline" : "secondary"}>{brandName(a.brand_id)}</Badge></td>
                    <td className="p-3 num" dir="ltr">{a.purchase_date}</td>
                    <td className="p-3 num">{fmt(Number(a.cost))}</td>
                    <td className="p-3 num">{Number(a.annual_depreciation_rate)}%</td>
                    <td className="p-3 num font-semibold text-primary">{fmt(netBook(a))}</td>
                    <td className="p-3 text-left whitespace-nowrap">
                      {canWrite && <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Pencil className="w-4 h-4" /></Button>}
                      {(roleQ.data?.isAdmin || roleQ.data?.isManager) && (
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm(tr("حذف هذا الأصل؟"))) delFn({ data: { id: a.id } }).then(() => { toast.success(tr("حُذف")); qc.invalidateQueries({ queryKey: ["assets"] }); });
                        }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <AssetDialog
          initial={editing}
          brands={brandsQ.data ?? []}
          onClose={() => setEditing(null)}
          onSave={(payload) => {
            upsertFn({ data: payload })
              .then(() => { toast.success(tr("تم الحفظ")); qc.invalidateQueries({ queryKey: ["assets"] }); setEditing(null); })
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "فشل"));
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function AssetDialog({ initial, brands, onClose, onSave }: {
  initial: Partial<CompanyAsset>;
  brands: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (payload: Partial<CompanyAsset> & { name: string; cost: number; purchase_date: string; annual_depreciation_rate: number }) => void;
}) {
  const [form, setForm] = useState<Partial<CompanyAsset>>(initial);
  const submit = () => {
    if (!form.name?.trim()) return toast.error(tr("اسم الأصل مطلوب"));
    if (!form.purchase_date) return toast.error(tr("تاريخ الشراء مطلوب"));
    const payload: Partial<CompanyAsset> & { name: string; cost: number; purchase_date: string; annual_depreciation_rate: number } = {
      name: form.name.trim(),
      cost: Number(form.cost) || 0,
      purchase_date: form.purchase_date,
      annual_depreciation_rate: Number(form.annual_depreciation_rate) || 0,
      brand_id: form.brand_id ?? null,
      notes: form.notes ?? null,
    };
    if (form.id) payload.id = form.id;
    onSave(payload);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{form.id ? "تعديل أصل" : "أصل جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{tr("اسم الأصل")}</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={tr("مثال: لابتوب Dell / مكينة تصنيع")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{tr("التكلفة")}</Label>
              <Input type="number" dir="ltr" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{tr("تاريخ الشراء")}</Label>
              <Input type="date" dir="ltr" value={form.purchase_date ?? ""} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{tr("معدل الإهلاك السنوي %")}</Label>
              <Input type="number" dir="ltr" value={form.annual_depreciation_rate ?? 0} onChange={(e) => setForm({ ...form, annual_depreciation_rate: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>{tr("البراند")}</Label>
              <Select value={form.brand_id ?? "company"} onValueChange={(v) => setForm({ ...form, brand_id: v === "company" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">{tr("أصل عام للشركة")}</SelectItem>
                  {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>{tr("ملاحظات (اختياري)")}</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <Button onClick={submit} className="w-full">{tr("حفظ")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
