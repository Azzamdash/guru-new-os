import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, MessageSquare, Pencil, History as HistoryIcon, ShoppingBag, CreditCard, Undo2, Search } from "lucide-react";
import { getCustomerProfile, addCustomerNote, deleteCustomerNote, updateCustomer } from "@/lib/customers.functions";
import { listBrands } from "@/lib/internal.functions";
import { useLang, tr } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/customers/$id")({
  head: () => ({ meta: [
    { title: tr("ملف العميل — e-GURUS") },
    { name: "description", content: "ملف عميل موحّد عبر كل البراندات مع سجل الطلبات والملاحظات." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { id } = Route.useParams();
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const getFn = useServerFn(getCustomerProfile);
  const addNoteFn = useServerFn(addCustomerNote);
  const delNoteFn = useServerFn(deleteCustomerNote);
  const updFn = useServerFn(updateCustomer);
  const brandsFn = useServerFn(listBrands);
  const profileQ = useQuery({ queryKey: ["customer", id], queryFn: () => getFn({ data: { id } }) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const [note, setNote] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; phone: string; email: string; governorate: string; isGeneral: boolean; brandIds: string[] } | null>(null);
  const [historyKind, setHistoryKind] = useState<"all" | "order" | "payment" | "refund">("all");
  const [historyQuery, setHistoryQuery] = useState("");

  const addNote = useMutation({
    mutationFn: () => addNoteFn({ data: { customerId: id, body: note } }),
    onSuccess: () => { setNote(""); toast.success(t("saved")); qc.invalidateQueries({ queryKey: ["customer", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delNote = useMutation({
    mutationFn: (noteId: string) => delNoteFn({ data: { id: noteId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer", id] }),
  });
  const update = useMutation({
    mutationFn: () => updFn({ data: { id, ...form! } }),
    onSuccess: () => { toast.success(t("saved")); setEditOpen(false); qc.invalidateQueries({ queryKey: ["customer", id] }); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit() {
    if (!profileQ.data) return;
    const c = profileQ.data.customer;
    setForm({
      name: c.name ?? "", phone: c.phone ?? "", email: c.email ?? "",
      governorate: c.governorate ?? "", isGeneral: !!c.is_general,
      brandIds: profileQ.data.brandDistribution.map((b: { brandId: string }) => b.brandId),
    });
    setEditOpen(true);
  }

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US");

  if (profileQ.isLoading) return <div className="p-8 text-muted-foreground">{t("loading")}</div>;
  if (profileQ.isError || !profileQ.data) return <div className="p-8 text-destructive">{t("error_loading")}</div>;

  const { customer, metrics, invoices, notes, brandDistribution, history } = profileQ.data;
  const historyItems = (history ?? []) as Array<{ kind: "order" | "payment" | "refund"; id: string; date: string; brandId: string; brandName: string; amount: number; label: string; detail: string; source: string }>;
  const filteredHistory = historyItems.filter((h) => {
    if (historyKind !== "all" && h.kind !== historyKind) return false;
    if (historyQuery.trim()) {
      const q = historyQuery.trim().toLowerCase();
      if (!h.label.toLowerCase().includes(q) && !h.detail.toLowerCase().includes(q) && !h.brandName.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const counts = {
    all: historyItems.length,
    order: historyItems.filter((h) => h.kind === "order").length,
    payment: historyItems.filter((h) => h.kind === "payment").length,
    refund: historyItems.filter((h) => h.kind === "refund").length,
  };
  const kindMeta: Record<"order" | "payment" | "refund", { icon: typeof ShoppingBag; tone: string; bg: string }> = {
    order:   { icon: ShoppingBag, tone: "text-primary", bg: "bg-primary/10" },
    payment: { icon: CreditCard,  tone: "text-emerald-500", bg: "bg-emerald-500/10" },
    refund:  { icon: Undo2,       tone: "text-destructive", bg: "bg-destructive/10" },
  };

  const segLabel: Record<string, string> = {
    vip: "VIP",
    active: lang === "ar" ? "نشط" : "Active",
    at_risk: lang === "ar" ? "معرض للفقد" : "At risk",
    new: lang === "ar" ? "جديد" : "New",
  };
  const segVariant = metrics.segment === "vip" ? "default" : metrics.segment === "at_risk" ? "destructive" : "secondary";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/customers"><ArrowLeft className="w-4 h-4 me-1" />{t("nav_customers")}</Link>
        </Button>
      </div>

      <Card className="card-gradient p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              {customer.name}
              <Badge variant={segVariant}>{segLabel[metrics.segment]}</Badge>
              <Button size="icon" variant="ghost" onClick={openEdit} title={t("customer_edit")}>
                <Pencil className="w-4 h-4" />
              </Button>
            </h1>
            <div className="text-sm text-muted-foreground mt-2 flex flex-wrap gap-4" dir="ltr">
              {customer.phone && <span>📞 {customer.phone}</span>}
              {customer.email && <span>✉ {customer.email}</span>}
              {customer.governorate && <span>📍 {customer.governorate}</span>}
            </div>
            {customer.tags && customer.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {customer.tags.map((tag: string) => <Badge key={tag} variant="outline">{tag}</Badge>)}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground text-end">
            <div>{lang === "ar" ? "أول ظهور" : "First seen"}: <span dir="ltr">{metrics.firstOrderAt?.slice(0, 10) ?? "—"}</span></div>
            <div>{lang === "ar" ? "آخر طلب" : "Last order"}: <span dir="ltr">{metrics.lastOrderAt?.slice(0, 10) ?? "—"}</span></div>
          </div>
        </div>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("customer_edit")}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div><Label>{t("customer_name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("customer_phone")}</Label><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>{t("customer_email")}</Label><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div><Label>{t("customer_governorate")}</Label><Input value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isGeneral} onCheckedChange={(v) => setForm({ ...form, isGeneral: !!v })} />
                {t("customer_is_general")}
              </label>
              <div>
                <Label>{t("customer_brands_assigned")}</Label>
                <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 rounded border border-border/50">
                  {(brandsQ.data ?? []).map((b) => {
                    const active = form.brandIds.includes(b.id);
                    return (
                      <button key={b.id} type="button"
                        onClick={() => setForm({ ...form, brandIds: active ? form.brandIds.filter((x) => x !== b.id) : [...form.brandIds, b.id] })}
                        className={`px-2 py-1 rounded text-xs border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border"}`}>
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending || !form?.name?.trim()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi label={lang === "ar" ? "إجمالي الإنفاق" : "Total spend"} value={nf(Math.round(metrics.ltv))} />
        <MiniKpi label={lang === "ar" ? "عدد الطلبات" : "Orders"} value={nf(metrics.orders)} />
        <MiniKpi label={lang === "ar" ? "متوسط قيمة الطلب" : "Avg order value"} value={nf(Math.round(metrics.avgOrder))} />
        <MiniKpi label={lang === "ar" ? "عدد البراندات" : "Brands"} value={String(brandDistribution.length)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4">{lang === "ar" ? "توزيع الإنفاق حسب البراند" : "Spend by brand"}</h3>
          <div className="space-y-3">
            {brandDistribution.length === 0 && <div className="text-sm text-muted-foreground">—</div>}
            {brandDistribution.map((b) => (
              <div key={b.brandId}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{b.name}</span>
                  <span className="num text-muted-foreground">{nf(Math.round(b.spend))} · {(b.pct * 100).toFixed(0)}%</span>
                </div>
                <Progress value={b.pct * 100} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="card-gradient p-5">
          <h3 className="font-semibold mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> {lang === "ar" ? "ملاحظات فريق السيلز" : "Sales team notes"}</h3>
          <div className="space-y-2 mb-3">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={lang === "ar" ? "أضف ملاحظة عن العميل (طريقة التواصل المفضلة، تفضيلات، إلخ)" : "Add a note about this customer"} rows={3} />
            <Button size="sm" onClick={() => addNote.mutate()} disabled={!note.trim() || addNote.isPending}>
              {t("save")}
            </Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {notes.length === 0 && <div className="text-sm text-muted-foreground">{lang === "ar" ? "لا ملاحظات بعد." : "No notes yet."}</div>}
            {notes.map((n) => (
              <div key={n.id} className="rounded border border-border/50 p-3 text-sm bg-muted/30">
                <div className="flex justify-between gap-2">
                  <p className="whitespace-pre-wrap flex-1">{n.body}</p>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(t("confirm_delete"))) delNote.mutate(n.id); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1" dir="ltr">{new Date(n.created_at).toLocaleString("en-US")}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{lang === "ar" ? "سجل الطلبات عبر البراندات" : "Order history across brands"}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-3 text-start">{t("date")}</th>
              <th className="p-3 text-start">{t("brand")}</th>
              <th className="p-3 text-start">{t("type")}</th>
              <th className="p-3 text-start">{t("qty")}</th>
              <th className="p-3 text-start">{t("total")}</th>
              <th className="p-3 text-start">{lang === "ar" ? "محصّل" : "Collected"}</th>
            </tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-border/50">
                  <td className="p-3 num" dir="ltr">{i.occurred_at}</td>
                  <td className="p-3">{i.brandName}</td>
                  <td className="p-3"><Badge variant={i.type === "sale" ? "default" : "destructive"}>{i.type}</Badge></td>
                  <td className="p-3 num">{Number(i.qty)}</td>
                  <td className="p-3 num">{Number(i.total_amount).toLocaleString("en-US")}</td>
                  <td className="p-3 num">{Number(i.collected_amount).toLocaleString("en-US")}</td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="card-gradient p-5">
        <div className="flex items-center gap-2 mb-4">
          <HistoryIcon className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">{lang === "ar" ? "السجل الكامل" : "Full history"}</h3>
          <span className="text-xs text-muted-foreground">({counts.all})</span>
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex rounded-md border border-border/60 bg-muted/30 p-1 gap-1">
              {(["all","order","payment","refund"] as const).map((k) => {
                const label = k === "all" ? (lang === "ar" ? "الكل" : "All") : k === "order" ? (lang === "ar" ? "طلبات" : "Orders") : k === "payment" ? (lang === "ar" ? "مدفوعات" : "Payments") : (lang === "ar" ? "مرتجعات" : "Refunds");
                const active = historyKind === k;
                return (
                  <button key={k} type="button" onClick={() => setHistoryKind(k)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {label} ({counts[k]})
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 absolute top-2.5 start-2 text-muted-foreground" />
              <Input className="ps-8" placeholder={lang === "ar" ? "ابحث في السجل..." : "Search history..."} value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} />
            </div>
          </div>
          {filteredHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              {counts.all === 0
                ? (lang === "ar" ? "لا توجد حركات مرتبطة بهذا العميل بعد." : "No activity linked to this customer yet.")
                : (lang === "ar" ? "لا توجد نتائج" : "No results")}
            </div>
          ) : (
              <ol className="relative border-s border-border/60 ms-3 space-y-3">
                {filteredHistory.map((h) => {
                  const meta = kindMeta[h.kind];
                  const Icon = meta.icon;
                  const kindLabel = h.kind === "order" ? (lang === "ar" ? "طلب" : "Order") : h.kind === "payment" ? (lang === "ar" ? "دفعة" : "Payment") : (lang === "ar" ? "مرتجع" : "Refund");
                  return (
                    <li key={h.id} className="ms-6">
                      <span className={`absolute -start-3.5 flex items-center justify-center w-7 h-7 rounded-full ring-4 ring-background ${meta.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.tone}`} />
                      </span>
                      <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={meta.tone}>{kindLabel}</Badge>
                            <span className="font-medium text-sm">{h.label}</span>
                            <span className="text-xs text-muted-foreground">· {h.brandName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`num font-semibold text-sm ${h.kind === "refund" ? "text-destructive" : h.kind === "payment" ? "text-emerald-500" : ""}`}>
                              {h.kind === "refund" ? "-" : h.kind === "payment" ? "+" : ""}{nf(Math.round(h.amount))}
                            </span>
                            <span className="text-[11px] text-muted-foreground num" dir="ltr">{h.date?.slice(0, 10)}</span>
                          </div>
                        </div>
                        {h.detail && <div className="text-xs text-muted-foreground mt-1">{h.detail}</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="card-gradient p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1 num">{value}</div>
    </Card>
  );
}