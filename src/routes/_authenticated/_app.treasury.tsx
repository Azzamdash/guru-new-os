import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  listBrands, listCouriers,
  listCashTransactions, upsertCashTransaction, deleteCashTransaction, getCashSummary,
  listWithdrawalActors,
  type CashTxnType,
} from "@/lib/internal.functions";
import { listCategories, listSuppliers } from "@/lib/internal.functions";
import { Link } from "@tanstack/react-router";
import { getMyRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Wallet, HandCoins, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Plus, Trash2, Lock, User, Truck } from "lucide-react";
import { WalletsPanel } from "@/components/WalletsPanel";
import { listWallets } from "@/lib/wallets.functions";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated/_app/treasury")({
  head: () => ({ meta: [
    { title: "الخزنة — التحصيلات والسحوبات" },
    { name: "description", content: "تسجيل تحصيلات المناديب وشركات الشحن، السحوبات الشخصية، والإيداعات مع رصيد الخزنة الحيّ." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: TreasuryPage,
});

const TYPE_LABEL: Record<CashTxnType, string> = {
  collection: "تحصيل من مندوب/شحن",
  personal_withdrawal: "سحب مالك / مستثمر",
  deposit: "إيداع في الخزنة",
  other_out: "مصروف نقدي عام",
};

const TYPE_ICON: Record<CashTxnType, typeof Wallet> = {
  collection: HandCoins,
  personal_withdrawal: ArrowUpFromLine,
  deposit: ArrowDownToLine,
  other_out: ArrowUpFromLine,
};

function today() { return getTodayInBusinessTimezone(); }
function addDays(d: string, n: number) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }
function fmt(n: number) { return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n); }

function TreasuryPage() {
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listCouriersFn = useServerFn(listCouriers);
  const listFn = useServerFn(listCashTransactions);
  const upsertFn = useServerFn(upsertCashTransaction);
  const delFn = useServerFn(deleteCashTransaction);
  const summaryFn = useServerFn(getCashSummary);
  const getRoleFn = useServerFn(getMyRole);
  const actorsFn = useServerFn(listWithdrawalActors);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite = !!roleQ.data && (roleQ.data.isAdmin || roleQ.data.isManager || roleQ.data.roles.some((r) => ["data_entry","accountant"].includes(r)));
  const canPickActor = !!roleQ.data && (roleQ.data.isAdmin || roleQ.data.isManager);
  const actorsQ = useQuery({ queryKey: ["withdrawal-actors"], queryFn: () => actorsFn(), enabled: canPickActor });

  const [me, setMe] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null)); }, []);

  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [typeFilter, setTypeFilter] = useState<"all" | CashTxnType>("all");
  const [courierFilter, setCourierFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [onlyMinePersonal, setOnlyMinePersonal] = useState(true);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const couriersQ = useQuery({ queryKey: ["couriers"], queryFn: () => listCouriersFn() });
  const categoriesFn = useServerFn(listCategories);
  const categoriesQ = useQuery({ queryKey: ["expense-categories"], queryFn: () => categoriesFn() });
  const listSuppliersFn = useServerFn(listSuppliers);
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliersFn() });


  const filters = { from, to, type: typeFilter === "all" ? null : typeFilter, courierId: courierFilter === "all" ? null : courierFilter, forUserId: actorFilter === "all" ? null : actorFilter };
  const listQ = useQuery({
    queryKey: ["cash-txns", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const summaryQ = useQuery({
    queryKey: ["cash-summary", from, to, onlyMinePersonal ? me : "all"],
    queryFn: () => summaryFn({ data: { from, to, forUserId: onlyMinePersonal ? me : null } }),
    enabled: !!me,
  });

  const initialForm = () => ({
    id: undefined as string | undefined,
    type: "collection" as CashTxnType,
    amount: 0,
    occurred_at: today(),
    brand_id: "" as string,
    courier_id: "" as string,
    for_user_id: "" as string,
    category_id: "" as string,
    platform: "" as string,
    attributed_revenue: 0,
    supplier_id: "" as string,
    wallet_id: "" as string,
    note: "",
  });
  const [form, setForm] = useState(initialForm());
  const walletsQ = useQuery({ queryKey: ["wallets"], queryFn: useServerFn(listWallets) });

  const selectedCategory = useMemo(
    () => (categoriesQ.data ?? []).find((c) => c.id === form.category_id) ?? null,
    [categoriesQ.data, form.category_id],
  );
  const isMarketingCat = useMemo(() => {
    const label = `${selectedCategory?.name ?? ""} ${selectedCategory?.slug ?? ""}`;
    return /market|تسويق|ماركت|إعلان|اعلان/.test(label);
  }, [selectedCategory]);
  const isPurchasesCat = useMemo(() => {
    const label = `${selectedCategory?.name ?? ""} ${selectedCategory?.slug ?? ""}`;
    return /purchas|مشترى|مشتري|مشتريات|شراء|مورد/.test(label);
  }, [selectedCategory]);
  const brandSuppliers = useMemo(() => {
    const all = suppliersQ.data ?? [];
    if (!form.brand_id) return all;
    return all.filter((s) => !s.brand_ids?.length || s.brand_ids.includes(form.brand_id));
  }, [suppliersQ.data, form.brand_id]);
  const selectedSupplier = useMemo(
    () => (suppliersQ.data ?? []).find((s) => s.id === form.supplier_id) ?? null,
    [suppliersQ.data, form.supplier_id],
  );

  const saveMut = useMutation({
    mutationFn: () => upsertFn({ data: {
      id: form.id, type: form.type, amount: Number(form.amount) || 0,
      occurred_at: form.occurred_at,
      brand_id: form.brand_id || null,
      courier_id: form.type === "collection" ? (form.courier_id || null) : null,
      for_user_id: form.type === "personal_withdrawal" ? (form.for_user_id || null) : null,
      category_id: form.type === "other_out" ? (form.category_id || null) : null,
      wallet_id: form.wallet_id || null,
      platform: form.type === "other_out" && isMarketingCat && form.platform ? (form.platform as "tiktok"|"meta"|"google"|"snapchat"|"whatsapp"|"sms"|"influencer"|"ugc"|"media_production"|"other") : null,
      attributed_revenue: form.type === "other_out" && isMarketingCat ? Number(form.attributed_revenue) || 0 : null,
      note: (() => {
        const supplierPrefix = form.type === "other_out" && isPurchasesCat && selectedSupplier ? `مورد: ${selectedSupplier.name}` : "";
        const merged = supplierPrefix ? (form.note ? `${supplierPrefix} — ${form.note}` : supplierPrefix) : form.note;
        return merged || null;
      })(),
    } }),

    onSuccess: () => {
      toast.success(form.id ? "تم التعديل" : "تم الحفظ");
      setForm(initialForm());
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(tr("تم الحذف"));
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  const couriersMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of couriersQ.data ?? []) m.set(c.id, c.name);
    return m;
  }, [couriersQ.data]);
  const brandsMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brandsQ.data ?? []) m.set(b.id, b.name);
    return m;
  }, [brandsQ.data]);
  const actorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of actorsQ.data ?? []) m.set(a.userId, a.name);
    return m;
  }, [actorsQ.data]);

  const s = summaryQ.data;

  const selectedCourierDebt = useMemo(() => {
    if (form.type !== "collection" || !form.courier_id) return null;
    return (s?.courierDebts ?? []).find((c) => c.id === form.courier_id) ?? null;
  }, [form.type, form.courier_id, s?.courierDebts]);

  const remainingAfter = selectedCourierDebt
    ? selectedCourierDebt.remaining - (Number(form.amount) || 0)
    : null;

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Wallet className="w-7 h-7 text-primary" /> ا{tr("الخزنة")}/h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("تحصيلات المناديب وشركات الشحن، السحوبات الشخصية، والإيداعات.")}</p>
        </div>
        {!canWrite && (
          <Badge variant="outline" className="gap-1"><Lock className="w-3 h-3" /> ع{tr("عرض فقط")}/Badge>
        )}
      </div>

      {/* Period filter — top */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs sm:text-sm">{tr("من")}</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{tr("إلى")}</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{tr("النوع")}</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | CashTxnType)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("الكل")}</SelectItem>
                <SelectItem value="collection">{tr("تحصيلات")}</SelectItem>
                <SelectItem value="personal_withdrawal">{tr("سحوبات شخصية")}</SelectItem>
                <SelectItem value="deposit">{tr("إيداعات")}</SelectItem>
                <SelectItem value="other_out">{tr("مصروفات نقدية")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{tr("المندوب")}</Label>
            <Select value={courierFilter} onValueChange={setCourierFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("الكل")}</SelectItem>
                {(couriersQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("الرصيد المتاح في الخزنة")}</div>
          <div className={`text-xl sm:text-2xl font-bold mt-1 ${(s?.balance ?? 0) < 0 ? "text-destructive" : "text-primary"}`}>{fmt(s?.balance ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("داخل خلال الفترة")}</div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-emerald-500">{fmt(s?.periodIn ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">{tr("خارج خلال الفترة")}</div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-destructive">{fmt(s?.periodOut ?? 0)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> س{tr("سحوبات مالك/مستثمر")}{onlyMinePersonal ? "(أنا)" : "(الكل)"}
          </div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{fmt(s?.personalTotal ?? 0)}</div>
          <button className="text-xs text-primary underline mt-1" onClick={() => setOnlyMinePersonal((v) => !v)}>
            {onlyMinePersonal ? "عرض كل المستخدمين" : "خصني بس"}
          </button>
        </Card>
      </div>

      <WalletsPanel canWrite={canWrite} from={from} to={to} />

      {/* Actor filter */}
      {canPickActor && (actorsQ.data ?? []).length > 0 && (
        <Card className="p-4">
          <Label className="text-xs sm:text-sm">{tr("مالك / مستثمر (فلترة السحوبات)")}</Label>
          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="mt-1 w-full sm:max-w-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("الكل")}</SelectItem>
              {(actorsQ.data ?? []).map((a) => (
                <SelectItem key={a.userId} value={a.userId}>{a.name} {a.kind === "investor" ? "· مستثمر" : "· مالك"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      {/* Add/Edit form */}
      {canWrite && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold"><Plus className="w-4 h-4" /> {form.id ? "تعديل عملية" : "إضافة عملية"}</div>
          <Tabs value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as CashTxnType, courier_id: v === "collection" ? f.courier_id : "" }))}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="collection" className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><HandCoins className="w-4 h-4 ml-1" /> ت{tr("تحصيل")}/TabsTrigger>
              <TabsTrigger value="personal_withdrawal" className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ArrowUpFromLine className="w-4 h-4 ml-1" /> س{tr("سحب مالك/مستثمر")}/TabsTrigger>
              <TabsTrigger value="deposit" className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><ArrowDownToLine className="w-4 h-4 ml-1" /> إ{tr("إيداع")}/TabsTrigger>
            </TabsList>
            <TabsContent value={form.type} className="mt-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <Label>{tr("المبلغ")}</Label>
                  <Input type="number" min="0" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>{tr("التاريخ")}</Label>
                  <Input type="date" value={form.occurred_at} onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))} />
                </div>
                {form.type === "collection" && (
                  <div>
                    <Label>{tr("المندوب / شركة الشحن *")}</Label>
                    <Select value={form.courier_id} onValueChange={(v) => setForm((f) => ({ ...f, courier_id: v }))}>
                      <SelectTrigger><SelectValue placeholder={tr("اختر")} /></SelectTrigger>
                      <SelectContent>
                        {(couriersQ.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "personal_withdrawal" && canPickActor && (
                  <div>
                    <Label>{tr("مالك / مستثمر *")}</Label>
                    <Select value={form.for_user_id} onValueChange={(v) => setForm((f) => ({ ...f, for_user_id: v }))}>
                      <SelectTrigger><SelectValue placeholder={tr("اختر الشخص")} /></SelectTrigger>
                      <SelectContent>
                        {(actorsQ.data ?? []).map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>{a.name} {a.kind === "investor" ? "· مستثمر" : "· مالك"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "other_out" && (
                  <div>
                    <Label>{tr("بند المصروف *")}</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v, platform: "", attributed_revenue: 0, supplier_id: "" }))}>
                      <SelectTrigger><SelectValue placeholder={tr("اختر البند")} /></SelectTrigger>
                      <SelectContent>
                        {(categoriesQ.data ?? []).filter((c) => c.active && c.slug !== "supplier_payments").map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "other_out" && isMarketingCat && (
                  <>
                    <div>
                      <Label>{tr("المنصة *")}</Label>
                      <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}>
                        <SelectTrigger><SelectValue placeholder={tr("اختر المنصة")} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="meta">Meta</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="snapchat">Snapchat</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="influencer">{tr("انفلونسر")}</SelectItem>
                          <SelectItem value="ugc">UGC</SelectItem>
                          <SelectItem value="media_production">Media Production</SelectItem>
                          <SelectItem value="other">{tr("أخرى")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{tr("الإيراد المنسوب")}</Label>
                      <Input type="number" min="0" value={form.attributed_revenue} onChange={(e) => setForm((f) => ({ ...f, attributed_revenue: Number(e.target.value) }))} />
                    </div>
                  </>
                )}
                {form.type === "other_out" && isPurchasesCat && (
                  <>
                    <div>
                      <Label>{tr("المورد *")}</Label>
                      <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}>
                        <SelectTrigger><SelectValue placeholder={tr("اختر المورد")} /></SelectTrigger>
                        <SelectContent>
                          {brandSuppliers.filter((s) => s.active).map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                          {brandSuppliers.length === 0 && <SelectItem value="__none" disabled>{tr("لا يوجد موردون لهذا البراند")}</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Link to="/purchases" className="text-xs text-primary underline hover:no-underline">
                        فتح فواتير المشتريات لإدخ{tr("فتح فواتير المشتريات لإدخال الأصناف بالتفصيل ↗")}Link>
                    </div>
                  </>
                )}
                <div>
                  <Label>{tr("البراند *")}</Label>
                  <Select value={form.brand_id} onValueChange={(v) => setForm((f) => ({ ...f, brand_id: v }))}>
                    <SelectTrigger><SelectValue placeholder={tr("اختر البراند")} /></SelectTrigger>
                    <SelectContent>
                      {(brandsQ.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{tr("المحفظة / الخزنة")}</Label>
                  <Select value={form.wallet_id} onValueChange={(v) => setForm((f) => ({ ...f, wallet_id: v }))}>
                    <SelectTrigger><SelectValue placeholder={tr("افتراضي")} /></SelectTrigger>
                    <SelectContent>
                      {(walletsQ.data ?? []).filter((w) => w.active).map((w) => (
                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-4">
                  <Label>{tr("ملاحظة")}</Label>
                  <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={tr("اختياري")} />
                </div>
              </div>


              {/* Live courier debt preview */}
              {selectedCourierDebt && (
                <div className="mt-4 p-3 rounded-md border bg-muted/30 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{tr("إجمالي المستحق")}</div>
                    <div className="font-semibold">{fmt(selectedCourierDebt.totalOwed)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tr("محصَّل سابقاً")}</div>
                    <div className="font-semibold text-emerald-500">{fmt(selectedCourierDebt.totalCollected)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tr("المتبقي حالياً")}</div>
                    <div className={`font-semibold ${selectedCourierDebt.remaining > 0 ? "text-destructive" : "text-emerald-500"}`}>{fmt(selectedCourierDebt.remaining)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{tr("المتبقي بعد هذا التحصيل")}</div>
                    <div className={`font-semibold ${(remainingAfter ?? 0) > 0 ? "text-destructive" : "text-emerald-500"}`}>{fmt(remainingAfter ?? 0)}</div>
                  </div>
                  {(Number(form.amount) || 0) > selectedCourierDebt.remaining && selectedCourierDebt.remaining > 0 && (
                    <div className="md:col-span-4 text-xs text-amber-600">
                      المبلغ أكبر من المتبقي {tr("المبلغ أكبر من المتبقي — سيسجَّل كتحصيل زائد (رصيد للمندوب).")}div>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || form.amount <= 0 || !form.brand_id || (form.type === "collection" && !form.courier_id) || (form.type === "personal_withdrawal" && canPickActor && !form.for_user_id) || (form.type === "other_out" && !form.category_id) || (form.type === "other_out" && isMarketingCat && !form.platform) || (form.type === "other_out" && isPurchasesCat && !form.supplier_id)}>
                  {saveMut.isPending ? "..." : (form.id ? "حفظ التعديل" : "حفظ")}
                </Button>
                {form.id && <Button variant="outline" onClick={() => setForm(initialForm())}>{tr("إلغاء")}</Button>}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* Courier debts */}
      {/* Withdrawals per person */}
      {canPickActor && (s?.byUser ?? []).length > 0 && (
        <Card className="p-4">
          <div className="font-semibold mb-3 flex items-center gap-2"><User className="w-4 h-4" /> س{tr("سحوبات المالك / المستثمرين خلال الفترة")}/div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{tr("الشخص")}</th>
                  <th className="p-2 text-right">{tr("إجمالي السحوبات")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(s?.byUser ?? []).map((u) => (
                  <tr key={u.userId} className="border-b last:border-0">
                    <td className="p-2 font-medium">{actorNameById.get(u.userId) ?? u.userId.slice(0, 8)}</td>
                    <td className="p-2 font-semibold text-destructive">{fmt(u.total)}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => { setActorFilter(u.userId); setTypeFilter("personal_withdrawal"); }}>
                        عرض التفاصيل
            {tr("عرض التفاصيل")}Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Courier debts */}
      <Card className="p-4">
        <div className="font-semibold mb-3 flex items-center gap-2"><Truck className="w-4 h-4" /> م{tr("مديونيات المناديب / شركات الشحن")}/div>
        {(s?.courierDebts ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">{tr("لا توجد بيانات.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr><th className="p-2 text-right">{tr("المندوب")}</th><th className="p-2 text-right">{tr("إجمالي مستحق")}</th><th className="p-2 text-right">{tr("محصَّل")}</th><th className="p-2 text-right">{tr("المتبقي")}</th><th className="p-2"></th></tr>
              </thead>
              <tbody>
                {(s?.courierDebts ?? []).filter((c) => c.remaining !== 0 || c.totalOwed !== 0).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2">{fmt(c.totalOwed)}</td>
                    <td className="p-2 text-emerald-500">{fmt(c.totalCollected)}</td>
                    <td className={`p-2 font-semibold ${c.remaining > 0 ? "text-destructive" : "text-emerald-500"}`}>{fmt(c.remaining)}</td>
                    <td className="p-2">
                      {canWrite && c.remaining > 0 && (
                        <Button size="sm" variant="outline" onClick={() => setForm({ ...initialForm(), type: "collection", courier_id: c.id, brand_id: c.brand_id ?? "", amount: c.remaining })}>
                          تحصيل الكل
                {tr("تحصيل الكل")}Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Transactions list */}
      <Card className="p-4">
        <div className="font-semibold mb-3">{tr("العمليات (")}{(listQ.data ?? []).length})</div>
        {listQ.isLoading ? (
          <div className="text-sm text-muted-foreground">{tr("جاري التحميل...")}</div>
        ) : (listQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">{tr("لا توجد عمليات في هذه الفترة.")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{tr("التاريخ")}</th>
                  <th className="p-2 text-right">{tr("النوع")}</th>
                  <th className="p-2 text-right">{tr("المبلغ")}</th>
                  <th className="p-2 text-right">{tr("المندوب")}</th>
                  <th className="p-2 text-right">{tr("البراند")}</th>
                  <th className="p-2 text-right">{tr("الشخص")}</th>
                  <th className="p-2 text-right">{tr("ملاحظة")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(listQ.data ?? []).map((r) => {
                  const isTransfer = !!r.transfer_group;
                  const Icon = isTransfer ? ArrowLeftRight : TYPE_ICON[r.type];
                  const isIn = r.type === "collection" || r.type === "deposit";
                  const rowCat = (categoriesQ.data ?? []).find((c) => c.id === r.category_id);
                  const isSupplierPay = rowCat?.slug === "supplier_payments";
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">{r.occurred_at}</td>
                      <td className="p-2"><span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {isTransfer ? "تحويل بين المحافظ" : TYPE_LABEL[r.type]}</span></td>
                      <td className={`p-2 font-semibold ${isTransfer ? "text-amber-500" : (isIn ? "text-emerald-500" : "text-destructive")}`}>{isIn ? "+" : "-"}{fmt(Number(r.amount))}</td>
                      <td className="p-2">{r.courier_id ? couriersMap.get(r.courier_id) ?? "—" : "—"}</td>
                      <td className="p-2">{r.brand_id ? brandsMap.get(r.brand_id) ?? "—" : "—"}</td>
                      <td className="p-2">{r.for_user_id ? (actorNameById.get(r.for_user_id) ?? r.for_user_id.slice(0, 6)) : "—"}</td>
                      <td className="p-2 text-muted-foreground">{r.note ?? "—"}{isSupplierPay && <span className="ms-1 text-[10px] text-amber-500">{tr("(دفعة مورد — تُدار من صفحة دفعات الموردين)")}</span>}</td>
                      <td className="p-2">
                        {canWrite && !isSupplierPay && r.type !== "other_out" && !isTransfer && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setForm({
                              id: r.id, type: r.type, amount: Number(r.amount),
                              occurred_at: r.occurred_at, brand_id: r.brand_id ?? "",
                              courier_id: r.courier_id ?? "", for_user_id: r.for_user_id ?? "",
                              category_id: r.category_id ?? "", platform: "", attributed_revenue: 0, supplier_id: "", wallet_id: r.wallet_id ?? "", note: r.note ?? "",
                            })}>{tr("تعديل")}</Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="w-3 h-3" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent dir="rtl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{tr("حذف العملية")}</AlertDialogTitle>
                                  <AlertDialogDescription>{tr("هل أنت متأكد؟ لا يمكن التراجع.")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => delMut.mutate(r.id)}>{tr("حذف")}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                        {r.type === "other_out" && !isTransfer && (
                          <span className="text-[10px] text-muted-foreground">{tr("تُدار من صفحة المصروفات")}</span>
                        )}
                        {isTransfer && (
                          <span className="text-[10px] text-muted-foreground">{tr("تُدار من لوحة المحافظ")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
