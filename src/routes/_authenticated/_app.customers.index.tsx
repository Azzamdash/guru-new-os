import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Repeat, AlertTriangle, TrendingUp, Plus } from "lucide-react";
import { listCustomers, createCustomer, type CustomerListRow } from "@/lib/customers.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";
import { PaginationBar, usePagination } from "@/components/PaginationBar";
import { TableSkeleton } from "@/components/TableSkeleton";

export const Route = createFileRoute("/_authenticated/_app/customers/")({
  head: () => ({ meta: [
    { title: "إدارة العملاء — e-GURUS" },
    { name: "description", content: "قائمة موحّدة بكل العملاء عبر البراندات مع LTV والقطاعات." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: CustomersPage,
});

function segmentColor(s: CustomerListRow["segment"]) {
  return s === "vip" ? "default" : s === "active" ? "secondary" : s === "at_risk" ? "destructive" : "outline";
}

function CustomersPage() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const listCustFn = useServerFn(listCustomers);
  const listBrandsFn = useServerFn(listBrands);
  const createFn = useServerFn(createCustomer);
  const custQ = useQuery({ queryKey: ["customers-list"], queryFn: () => listCustFn() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const brands = brandsQ.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  const [search, setSearch] = useState("");
  const [segFilter, setSegFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", governorate: "", isGeneral: false, brandIds: [] as string[] });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: {
      name: form.name, phone: form.phone, email: form.email, governorate: form.governorate,
      isGeneral: form.isGeneral, brandIds: form.brandIds,
    } }),
    onSuccess: () => {
      toast.success(t("saved"));
      setDialogOpen(false);
      setForm({ name: "", phone: "", email: "", governorate: "", isGeneral: false, brandIds: [] });
      qc.invalidateQueries({ queryKey: ["customers-list"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleBrand = (id: string) => {
    setForm((f) => ({ ...f, brandIds: f.brandIds.includes(id) ? f.brandIds.filter((x) => x !== id) : [...f.brandIds, id] }));
  };

  const rows = custQ.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (segFilter !== "all" && r.segment !== segFilter) return false;
      if (brandFilter !== "all" && !r.brandIds.includes(brandFilter)) return false;
      if (!q) return true;
      if (r.name.toLowerCase().includes(q)) return true;
      if (r.phone?.toLowerCase().includes(q)) return true;
      if (r.email?.toLowerCase().includes(q)) return true;
      if (r.brandIds.some((id) => brandName(id).toLowerCase().includes(q))) return true;
      return false;
    });
  }, [rows, search, segFilter, brandFilter, brands]);

  const pg = usePagination(filtered, 25);

  const kpis = useMemo(() => {
    const total = rows.length;
    const ltvSum = rows.reduce((a, r) => a + r.ltv, 0);
    const avgLtv = total > 0 ? ltvSum / total : 0;
    const repeatCount = rows.filter((r) => r.orders >= 2).length;
    const repeatRate = total > 0 ? repeatCount / total : 0;
    const atRisk = rows.filter((r) => r.segment === "at_risk").length;
    return { total, avgLtv, repeatRate, atRisk };
  }, [rows]);

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  const segLabel: Record<string, string> = {
    vip: lang === "ar" ? "VIP" : "VIP",
    active: lang === "ar" ? "نشط" : "Active",
    at_risk: lang === "ar" ? "معرض للفقد" : "At risk",
    new: lang === "ar" ? "جديد" : "New",
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{t("nav_customers")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar" ? "قائمة موحّدة عبر كل البراندات — عميل واحد حتى لو اشترى من أكثر من براند." : "One unified list across all brands — deduplicated per customer."}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />{lang === "ar" ? "عميل جديد" : "New customer"}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{lang === "ar" ? "إضافة عميل يدوي" : "Add customer"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("customer_name")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("customer_phone")}</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>{t("customer_email")}</Label><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div><Label>{lang === "ar" ? "المحافظة" : "Governorate"}</Label><Input value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} /></div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="isGeneral" checked={form.isGeneral} onCheckedChange={(v) => setForm({ ...form, isGeneral: !!v })} />
                <Label htmlFor="isGeneral" className="cursor-pointer">{lang === "ar" ? "عميل عام (غير مربوط ببراند محدد)" : "General customer (not brand-specific)"}</Label>
              </div>
              {!form.isGeneral && (
                <div>
                  <Label>{lang === "ar" ? "البراندات المرتبطة" : "Assigned brands"}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto rounded border border-border/50 p-2">
                    {brands.filter((b) => b.active).map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox checked={form.brandIds.includes(b.id)} onCheckedChange={() => toggleBrand(b.id)} />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button onClick={() => createMut.mutate()} disabled={!form.name.trim() || createMut.isPending}>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label={lang === "ar" ? "عدد العملاء" : "Customers"} value={nf(kpis.total)} />
        <Kpi icon={TrendingUp} label={lang === "ar" ? "متوسط LTV" : "Avg LTV"} value={nf(Math.round(kpis.avgLtv))} />
        <Kpi icon={Repeat} label={lang === "ar" ? "معدل التكرار" : "Repeat rate"} value={`${(kpis.repeatRate * 100).toFixed(1)}%`} />
        <Kpi icon={AlertTriangle} label={lang === "ar" ? "معرضون للفقد" : "At risk"} value={nf(kpis.atRisk)} tone="danger" />
      </div>

      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-center">
        <Input className="max-w-xs" placeholder={lang === "ar" ? "ابحث بالاسم/التليفون/البريد/البراند" : "Search name / phone / email / brand"} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={segFilter} onValueChange={setSegFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل القطاعات" : "All segments"}</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
            <SelectItem value="active">{segLabel.active}</SelectItem>
            <SelectItem value="at_risk">{segLabel.at_risk}</SelectItem>
            <SelectItem value="new">{segLabel.new}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_brands")}</SelectItem>
            {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ms-auto">
          {filtered.length} / {rows.length}
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground text-start">
              <th className="p-3 text-start">{lang === "ar" ? "العميل" : "Customer"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "التواصل" : "Contact"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "المحافظة" : "Governorate"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "البراندات" : "Brands"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "الطلبات" : "Orders"}</th>
              <th className="p-3 text-start">LTV</th>
              <th className="p-3 text-start">{lang === "ar" ? "متوسط الطلب" : "Avg order"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "آخر طلب" : "Last order"}</th>
              <th className="p-3 text-start">{lang === "ar" ? "الحالة" : "Segment"}</th>
            </tr></thead>
            <tbody>
              {custQ.isLoading && (
                <tr><td colSpan={9} className="p-4"><TableSkeleton rows={6} cols={9} /></td></tr>
              )}
              {!custQ.isLoading && pg.slice.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="p-3 font-medium">
                    <Link to="/customers/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.name}</Link>
                    {r.isGeneral && <Badge variant="outline" className="ms-2">{lang === "ar" ? "عام" : "General"}</Badge>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground" dir="ltr">
                    {r.phone || "—"}{r.email ? ` · ${r.email}` : ""}
                  </td>
                  <td className="p-3 text-xs">{r.governorate || "—"}</td>
                  <td className="p-3 text-xs">
                    <span className="inline-flex flex-wrap gap-1">
                      {r.brandIds.slice(0, 3).map((id) => <Badge key={id} variant="outline">{brandName(id)}</Badge>)}
                      {r.brandIds.length > 3 && <Badge variant="outline">+{r.brandIds.length - 3}</Badge>}
                    </span>
                  </td>
                  <td className="p-3 num">{r.orders}</td>
                  <td className="p-3 num">{nf(Math.round(r.ltv))}</td>
                  <td className="p-3 num">{nf(Math.round(r.avgOrder))}</td>
                  <td className="p-3 num text-xs" dir="ltr">{r.lastOrderAt?.slice(0, 10) ?? "—"}</td>
                  <td className="p-3"><Badge variant={segmentColor(r.segment)}>{segLabel[r.segment]}</Badge></td>
                </tr>
              ))}
              {!custQ.isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                  {lang === "ar" ? "لا يوجد عملاء بعد. اضف بيانات العميل عند إنشاء فاتورة بيع ليظهر هنا." : "No customers yet. Add customer info on a sales invoice to see them here."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar {...pg} />
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: "danger" }) {
  return (
    <Card className="card-gradient p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className={`w-4 h-4 ${tone === "danger" ? "text-destructive" : "text-primary"}`} />
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 num ${tone === "danger" ? "text-destructive" : ""}`}>{value}</div>
    </Card>
  );
}