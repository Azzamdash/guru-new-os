import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  listBrands,
  listCouriers,
  listCashTransactions,
  upsertCashTransaction,
  deleteCashTransaction,
  getCashSummary,
  listWithdrawalActors,
  type CashTxnType,
} from "@/lib/internal.functions";
import { listCategories, listSuppliers } from "@/lib/internal.functions";
import { isMarketingCategory } from "@/lib/expense-category.shared";
import { Link } from "@tanstack/react-router";
import { getMyRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Wallet,
  HandCoins,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Plus,
  Trash2,
  Lock,
  User,
  Truck,
} from "lucide-react";
import { WalletsPanel } from "@/components/WalletsPanel";
import {
  listWallets,
  getTreasuryReconciliation,
  assignOrphanCashToWallet,
} from "@/lib/wallets.functions";
import { useEffect } from "react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/treasury")({
  head: () => ({
    meta: [
      { title: "الخزنة — التحصيلات والسحوبات" },
      {
        name: "description",
        content:
          "تسجيل تحصيلات المناديب وشركات الشحن، السحوبات الشخصية، والإيداعات مع رصيد الخزنة الحيّ.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TreasuryPage,
});

const TYPE_LABEL: Record<CashTxnType, string> = {
  collection: "تحصيل من مندوب/شحن",
  personal_withdrawal: "سحب مالك / مستثمر",
  deposit: "إيداع في الخزنة",
  other_out: "مصروف نقدي عام",
};

const TYPE_LABEL_EN: Record<CashTxnType, string> = {
  collection: "Collection from courier/shipping",
  personal_withdrawal: "Owner/investor withdrawal",
  deposit: "Treasury deposit",
  other_out: "General cash expense",
};

const TYPE_ICON: Record<CashTxnType, typeof Wallet> = {
  collection: HandCoins,
  personal_withdrawal: ArrowUpFromLine,
  deposit: ArrowDownToLine,
  other_out: ArrowUpFromLine,
};

function today() {
  return getTodayInBusinessTimezone();
}
function addDays(d: string, n: number) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function TreasuryPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
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
  const canWrite =
    !!roleQ.data &&
    (roleQ.data.isAdmin ||
      roleQ.data.isManager ||
      roleQ.data.roles.some((r) => ["data_entry", "accountant"].includes(r)));
  const canPickActor = !!roleQ.data && (roleQ.data.isAdmin || roleQ.data.isManager);
  const actorsQ = useQuery({
    queryKey: ["withdrawal-actors"],
    queryFn: () => actorsFn(),
    enabled: canPickActor,
  });

  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

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

  const filters = {
    from,
    to,
    type: typeFilter === "all" ? null : typeFilter,
    courierId: courierFilter === "all" ? null : courierFilter,
    forUserId: actorFilter === "all" ? null : actorFilter,
  };
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
  const isMarketingCat = useMemo(
    () => isMarketingCategory(selectedCategory?.name, selectedCategory?.slug),
    [selectedCategory],
  );
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
    mutationFn: () =>
      upsertFn({
        data: {
          id: form.id,
          type: form.type,
          amount: Number(form.amount) || 0,
          occurred_at: form.occurred_at,
          brand_id: form.brand_id || null,
          courier_id: form.type === "collection" ? form.courier_id || null : null,
          for_user_id: form.type === "personal_withdrawal" ? form.for_user_id || null : null,
          category_id: form.type === "other_out" ? form.category_id || null : null,
          wallet_id: form.wallet_id || null,
          platform:
            form.type === "other_out" && isMarketingCat && form.platform
              ? (form.platform as
                  | "tiktok"
                  | "meta"
                  | "google"
                  | "snapchat"
                  | "whatsapp"
                  | "sms"
                  | "influencer"
                  | "ugc"
                  | "media_production"
                  | "other")
              : null,
          attributed_revenue:
            form.type === "other_out" && isMarketingCat
              ? Number(form.attributed_revenue) || 0
              : null,
          note: (() => {
            const supplierPrefix =
              form.type === "other_out" && isPurchasesCat && selectedSupplier
                ? `مورد: ${selectedSupplier.name}`
                : "";
            const merged = supplierPrefix
              ? form.note
                ? `${supplierPrefix} — ${form.note}`
                : supplierPrefix
              : form.note;
            return merged || null;
          })(),
        },
      }),

    onSuccess: () => {
      toast.success(
        form.id ? T("تم التعديل", "Updated successfully") : T("تم الحفظ", "Saved successfully"),
      );
      setForm(initialForm());
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل الحفظ", "Failed to save")),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted successfully"));
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : T("فشل الحذف", "Failed to delete")),
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

  const reconFn = useServerFn(getTreasuryReconciliation);
  const reconQ = useQuery({ queryKey: ["treasury-reconciliation"], queryFn: () => reconFn() });
  const s = summaryQ.data;
  const recon = reconQ.data;
  // Only worth showing when the two really are apart; a rounding-level gap is noise.
  const reconGap = Math.abs((recon?.expectedBalance ?? 0) - (s?.balance ?? 0));
  const assignOrphans = useServerFn(assignOrphanCashToWallet);
  const [orphanWallet, setOrphanWallet] = useState("");
  const orphanMutation = useMutation({
    mutationFn: () => assignOrphans({ data: { walletId: orphanWallet } }),
    onSuccess: (r) => {
      toast.success(
        lang === "ar"
          ? `تم ربط ${r.assigned} حركة بالمحفظة`
          : `Linked ${r.assigned} movement(s) to the wallet`,
      );
      setOrphanWallet("");
      qc.invalidateQueries({ queryKey: ["treasury-reconciliation"] });
      qc.invalidateQueries({ queryKey: ["wallet-balances"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedCourierDebt = useMemo(() => {
    if (form.type !== "collection" || !form.courier_id) return null;
    return (s?.courierDebts ?? []).find((c) => c.id === form.courier_id) ?? null;
  }, [form.type, form.courier_id, s?.courierDebts]);

  const remainingAfter = selectedCourierDebt
    ? selectedCourierDebt.remaining - (Number(form.amount) || 0)
    : null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wallet className="w-7 h-7 text-primary" /> {T("الخزنة", "Treasury")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "تحصيلات المناديب وشركات الشحن، السحوبات الشخصية، والإيداعات.",
              "Courier and shipping company collections, personal withdrawals, and deposits.",
            )}
          </p>
        </div>
        {!canWrite && (
          <Badge variant="outline" className="gap-1">
            <Lock className="w-3 h-3" /> {T("عرض فقط", "View only")}
          </Badge>
        )}
      </div>

      {/* Period filter — top */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs sm:text-sm">{T("من", "From")}</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{T("إلى", "To")}</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{T("النوع", "Type")}</Label>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as "all" | CashTxnType)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T("الكل", "All")}</SelectItem>
                <SelectItem value="collection">{T("تحصيلات", "Collections")}</SelectItem>
                <SelectItem value="personal_withdrawal">
                  {T("سحوبات شخصية", "Personal withdrawals")}
                </SelectItem>
                <SelectItem value="deposit">{T("إيداعات", "Deposits")}</SelectItem>
                <SelectItem value="other_out">{T("مصروفات نقدية", "Cash expenses")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs sm:text-sm">{T("المندوب", "Courier")}</Label>
            <Select value={courierFilter} onValueChange={setCourierFilter}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T("الكل", "All")}</SelectItem>
                {(couriersQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {T("الرصيد المتاح في الخزنة", "Available treasury balance")}
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold mt-1 ${(s?.balance ?? 0) < 0 ? "text-destructive" : "text-primary"}`}
          >
            {fmt(s?.balance ?? 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {T("داخل خلال الفترة", "In during period")}
          </div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-emerald-500">
            {fmt(s?.periodIn ?? 0)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">
            {T("خارج خلال الفترة", "Out during period")}
          </div>
          <div className="text-xl sm:text-2xl font-bold mt-1 text-destructive">
            {fmt(s?.periodOut ?? 0)}
          </div>
          {/*
            This figure counts cash that left a wallet. Expenses recorded for the
            period but never paid out are real money owed, and dropping them from
            the card without a word makes the period look cheaper than it was —
            so they are named here rather than folded into a cash number.
          */}
          {(s?.periodUnpaidExpenses ?? 0) > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {T("+ مستحق لم يُدفع: ", "+ owed, not yet paid: ")}
              <span className="num font-medium">{fmt(s?.periodUnpaidExpenses ?? 0)}</span>
            </div>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> {T("سحوبات مالك/مستثمر", "Owner/investor withdrawals")}{" "}
            {onlyMinePersonal ? T("(أنا)", "(me)") : T("(الكل)", "(all)")}
          </div>
          <div className="text-xl sm:text-2xl font-bold mt-1">{fmt(s?.personalTotal ?? 0)}</div>
          <button
            className="text-xs text-primary underline mt-1"
            onClick={() => setOnlyMinePersonal((v) => !v)}
          >
            {onlyMinePersonal ? T("عرض كل المستخدمين", "Show all users") : T("خصني بس", "Just me")}
          </button>
        </Card>
      </div>

      {/*
        The headline balance and the wallet cards come from different places:
        cash_summary_report reads the cash_daily_metrics rollup and adds every
        wallet's opening balance, while the wallet cards read cash_transactions
        and skip rows with no wallet_id. Since 20260810250000 both are cash
        only, so the only thing left between them is unassigned movements.
        Rather than leave two totals looking broken side by side, name it.
      */}
      {recon && (recon.unassignedCount > 0 || reconGap > 1) && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-semibold">
            {T(
              "ليه الرصيد مختلف عن مجموع المحافظ؟",
              "Why does the balance differ from the wallets?",
            )}
          </div>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-border/50">
                <td className="py-2">{T("مجموع المحافظ والخزائن", "Wallets total")}</td>
                <td className="py-2 num text-end font-semibold">{fmt(recon.walletsTotal)}</td>
              </tr>
              {recon.unassignedCount > 0 && (
                <tr className="border-b border-border/50">
                  <td className="py-2">
                    {T("حركات من غير محفظة", "Movements with no wallet")}
                    <span className="text-muted-foreground text-xs ms-1">
                      ({recon.unassignedCount})
                    </span>
                  </td>
                  <td className="py-2 num text-end text-amber-600 dark:text-amber-400">
                    {fmt(recon.unassignedNet)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-2 font-semibold">
                  {T("الرصيد المتاح في الخزنة", "Available treasury balance")}
                </td>
                <td className="py-2 num text-end font-semibold">{fmt(s?.balance ?? 0)}</td>
              </tr>
              {(s?.unpaidExpenses ?? 0) > 0 && (
                <tr className="border-t border-border">
                  <td className="py-2 text-muted-foreground">
                    {T(
                      "مصاريف مستحقة لسه ما اتدفعتش (مش مخصومة من الرصيد)",
                      "Expenses owed but not yet paid (not deducted from the balance)",
                    )}
                  </td>
                  <td className="py-2 num text-end text-amber-600 dark:text-amber-400">
                    {fmt(s?.unpaidExpenses ?? 0)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {recon.unassignedCount > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {T(
                  "الحركات دي فلوس حقيقية بس مش محسوبة على أي خزنة. الحركات الجديدة بقت بتتربط تلقائي — دي القديمة، اختار تروح لأنهي محفظة.",
                  "These are real cash that no wallet accounts for. New movements are linked automatically — these are the old ones; choose which wallet they belong to.",
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={orphanWallet} onValueChange={setOrphanWallet}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder={T("اختر المحفظة", "Choose a wallet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(walletsQ.data ?? []).map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!orphanWallet || orphanMutation.isPending}
                  onClick={() => orphanMutation.mutate()}
                >
                  {T(`اربط ${recon.unassignedCount} حركة`, `Link ${recon.unassignedCount}`)}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <WalletsPanel canWrite={canWrite} from={from} to={to} />

      {/* Actor filter */}
      {canPickActor && (actorsQ.data ?? []).length > 0 && (
        <Card className="p-4">
          <Label className="text-xs sm:text-sm">
            {T("مالك / مستثمر (فلترة السحوبات)", "Owner / investor (filter withdrawals)")}
          </Label>
          <Select value={actorFilter} onValueChange={setActorFilter}>
            <SelectTrigger className="mt-1 w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("الكل", "All")}</SelectItem>
              {(actorsQ.data ?? []).map((a) => (
                <SelectItem key={a.userId} value={a.userId}>
                  {a.name}{" "}
                  {a.kind === "investor" ? T("· مستثمر", "· investor") : T("· مالك", "· owner")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}

      {/* Add/Edit form */}
      {canWrite && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Plus className="w-4 h-4" />{" "}
            {form.id ? T("تعديل عملية", "Edit transaction") : T("إضافة عملية", "Add transaction")}
          </div>
          <Tabs
            value={form.type}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                type: v as CashTxnType,
                courier_id: v === "collection" ? f.courier_id : "",
              }))
            }
          >
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger
                value="collection"
                className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <HandCoins className="w-4 h-4 ml-1" /> {T("تحصيل", "Collection")}
              </TabsTrigger>
              <TabsTrigger
                value="personal_withdrawal"
                className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <ArrowUpFromLine className="w-4 h-4 ml-1" />{" "}
                {T("سحب مالك/مستثمر", "Owner/investor withdrawal")}
              </TabsTrigger>
              <TabsTrigger
                value="deposit"
                className="flex-1 min-w-[140px] data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <ArrowDownToLine className="w-4 h-4 ml-1" /> {T("إيداع", "Deposit")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value={form.type} className="mt-4">
              <div className="grid md:grid-cols-4 gap-3">
                <div>
                  <Label>{T("المبلغ", "Amount")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <Label>{T("التاريخ", "Date")}</Label>
                  <Input
                    type="date"
                    value={form.occurred_at}
                    onChange={(e) => setForm((f) => ({ ...f, occurred_at: e.target.value }))}
                  />
                </div>
                {form.type === "collection" && (
                  <div>
                    <Label>{T("المندوب / شركة الشحن *", "Courier / shipping company *")}</Label>
                    <Select
                      value={form.courier_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, courier_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={T("اختر", "Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(couriersQ.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "personal_withdrawal" && canPickActor && (
                  <div>
                    <Label>{T("مالك / مستثمر *", "Owner / investor *")}</Label>
                    <Select
                      value={form.for_user_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, for_user_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={T("اختر الشخص", "Select person")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(actorsQ.data ?? []).map((a) => (
                          <SelectItem key={a.userId} value={a.userId}>
                            {a.name}{" "}
                            {a.kind === "investor"
                              ? T("· مستثمر", "· investor")
                              : T("· مالك", "· owner")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "other_out" && (
                  <div>
                    <Label>{T("بند المصروف *", "Expense category *")}</Label>
                    <Select
                      value={form.category_id}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          category_id: v,
                          platform: "",
                          attributed_revenue: 0,
                          supplier_id: "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={T("اختر البند", "Select category")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(categoriesQ.data ?? [])
                          .filter((c) => c.active && c.slug !== "supplier_payments")
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.type === "other_out" && isMarketingCat && (
                  <>
                    <div>
                      <Label>{T("المنصة *", "Platform *")}</Label>
                      <Select
                        value={form.platform}
                        onValueChange={(v) => setForm((f) => ({ ...f, platform: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={T("اختر المنصة", "Select platform")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="meta">Meta</SelectItem>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="snapchat">Snapchat</SelectItem>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="influencer">{T("انفلونسر", "Influencer")}</SelectItem>
                          <SelectItem value="ugc">UGC</SelectItem>
                          <SelectItem value="media_production">Media Production</SelectItem>
                          <SelectItem value="other">{T("أخرى", "Other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{T("الإيراد المنسوب", "Attributed revenue")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={form.attributed_revenue}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, attributed_revenue: Number(e.target.value) }))
                        }
                      />
                    </div>
                  </>
                )}
                {form.type === "other_out" && isPurchasesCat && (
                  <>
                    <div>
                      <Label>{T("المورد *", "Supplier *")}</Label>
                      <Select
                        value={form.supplier_id}
                        onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={T("اختر المورد", "Select supplier")} />
                        </SelectTrigger>
                        <SelectContent>
                          {brandSuppliers
                            .filter((s) => s.active)
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          {brandSuppliers.length === 0 && (
                            <SelectItem value="__none" disabled>
                              {T("لا يوجد موردون لهذا البراند", "No suppliers for this brand")}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Link
                        to="/purchases"
                        className="text-xs text-primary underline hover:no-underline"
                      >
                        {T(
                          "فتح فواتير المشتريات لإدخال الأصناف بالتفصيل ↗",
                          "Open purchase invoices to enter items in detail ↗",
                        )}
                      </Link>
                    </div>
                  </>
                )}
                <div>
                  <Label>{T("البراند *", "Brand *")}</Label>
                  <Select
                    value={form.brand_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, brand_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={T("اختر البراند", "Select brand")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(brandsQ.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{T("المحفظة / الخزنة", "Wallet / treasury")}</Label>
                  <Select
                    value={form.wallet_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, wallet_id: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={T("افتراضي", "Default")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(walletsQ.data ?? [])
                        .filter((w) => w.active)
                        .map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-4">
                  <Label>{T("ملاحظة", "Note")}</Label>
                  <Input
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                    placeholder={T("اختياري", "Optional")}
                  />
                </div>
              </div>

              {/* Live courier debt preview */}
              {selectedCourierDebt && (
                <div className="mt-4 p-3 rounded-md border bg-muted/30 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {T("إجمالي المستحق", "Total owed")}
                    </div>
                    <div className="font-semibold">{fmt(selectedCourierDebt.totalOwed)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {T("محصَّل سابقاً", "Previously collected")}
                    </div>
                    <div className="font-semibold text-emerald-500">
                      {fmt(selectedCourierDebt.totalCollected)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {T("المتبقي حالياً", "Currently remaining")}
                    </div>
                    <div
                      className={`font-semibold ${selectedCourierDebt.remaining > 0 ? "text-destructive" : "text-emerald-500"}`}
                    >
                      {fmt(selectedCourierDebt.remaining)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {T("المتبقي بعد هذا التحصيل", "Remaining after this collection")}
                    </div>
                    <div
                      className={`font-semibold ${(remainingAfter ?? 0) > 0 ? "text-destructive" : "text-emerald-500"}`}
                    >
                      {fmt(remainingAfter ?? 0)}
                    </div>
                  </div>
                  {(Number(form.amount) || 0) > selectedCourierDebt.remaining &&
                    selectedCourierDebt.remaining > 0 && (
                      <div className="md:col-span-4 text-xs text-amber-600">
                        {T(
                          "المبلغ أكبر من المتبقي — سيسجَّل كتحصيل زائد (رصيد للمندوب).",
                          "Amount exceeds remaining balance — will be recorded as an overpayment (credit to courier).",
                        )}
                      </div>
                    )}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  onClick={() => saveMut.mutate()}
                  disabled={
                    saveMut.isPending ||
                    form.amount <= 0 ||
                    !form.brand_id ||
                    (form.type === "collection" && !form.courier_id) ||
                    (form.type === "personal_withdrawal" && canPickActor && !form.for_user_id) ||
                    (form.type === "other_out" && !form.category_id) ||
                    (form.type === "other_out" && isMarketingCat && !form.platform) ||
                    (form.type === "other_out" && isPurchasesCat && !form.supplier_id)
                  }
                >
                  {saveMut.isPending
                    ? "..."
                    : form.id
                      ? T("حفظ التعديل", "Save changes")
                      : T("حفظ", "Save")}
                </Button>
                {form.id && (
                  <Button variant="outline" onClick={() => setForm(initialForm())}>
                    {T("إلغاء", "Cancel")}
                  </Button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      )}

      {/* Courier debts */}
      {/* Withdrawals per person */}
      {canPickActor && (s?.byUser ?? []).length > 0 && (
        <Card className="p-4">
          <div className="font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />{" "}
            {T(
              "سحوبات المالك / المستثمرين خلال الفترة",
              "Owner / investor withdrawals during period",
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{T("الشخص", "Person")}</th>
                  <th className="p-2 text-right">{T("إجمالي السحوبات", "Total withdrawals")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(s?.byUser ?? []).map((u) => (
                  <tr key={u.userId} className="border-b last:border-0">
                    <td className="p-2 font-medium">
                      {actorNameById.get(u.userId) ?? u.userId.slice(0, 8)}
                    </td>
                    <td className="p-2 font-semibold text-destructive">{fmt(u.total)}</td>
                    <td className="p-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActorFilter(u.userId);
                          setTypeFilter("personal_withdrawal");
                        }}
                      >
                        {T("عرض التفاصيل", "View details")}
                      </Button>
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
        <div className="font-semibold mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4" />{" "}
          {T("مديونيات المناديب / شركات الشحن", "Courier / shipping company debts")}
        </div>
        {(s?.courierDebts ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {T("لا توجد بيانات.", "No data available.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{T("المندوب", "Courier")}</th>
                  <th className="p-2 text-right">{T("إجمالي مستحق", "Total owed")}</th>
                  <th className="p-2 text-right">{T("محصَّل", "Collected")}</th>
                  <th className="p-2 text-right">{T("المتبقي", "Remaining")}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(s?.courierDebts ?? [])
                  .filter((c) => c.remaining !== 0 || c.totalOwed !== 0)
                  .map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2">{fmt(c.totalOwed)}</td>
                      <td className="p-2 text-emerald-500">{fmt(c.totalCollected)}</td>
                      <td
                        className={`p-2 font-semibold ${c.remaining > 0 ? "text-destructive" : "text-emerald-500"}`}
                      >
                        {fmt(c.remaining)}
                      </td>
                      <td className="p-2">
                        {canWrite && c.remaining > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({
                                ...initialForm(),
                                type: "collection",
                                courier_id: c.id,
                                brand_id: c.brand_id ?? "",
                                amount: c.remaining,
                              })
                            }
                          >
                            {T("تحصيل الكل", "Collect all")}
                          </Button>
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
        <div className="font-semibold mb-3">
          {T("العمليات", "Transactions")} ({(listQ.data ?? []).length})
        </div>
        {listQ.isLoading ? (
          <div className="text-sm text-muted-foreground">{T("جاري التحميل...", "Loading...")}</div>
        ) : (listQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {T("لا توجد عمليات في هذه الفترة.", "No transactions in this period.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="p-2 text-right">{T("التاريخ", "Date")}</th>
                  <th className="p-2 text-right">{T("النوع", "Type")}</th>
                  <th className="p-2 text-right">{T("المبلغ", "Amount")}</th>
                  <th className="p-2 text-right">{T("المندوب", "Courier")}</th>
                  <th className="p-2 text-right">{T("البراند", "Brand")}</th>
                  <th className="p-2 text-right">{T("الشخص", "Person")}</th>
                  <th className="p-2 text-right">{T("ملاحظة", "Note")}</th>
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
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1">
                          <Icon className="w-3 h-3" />{" "}
                          {isTransfer
                            ? T("تحويل بين المحافظ", "Transfer between wallets")
                            : (lang === "ar" ? TYPE_LABEL : TYPE_LABEL_EN)[r.type]}
                        </span>
                      </td>
                      <td
                        className={`p-2 font-semibold ${isTransfer ? "text-amber-500" : isIn ? "text-emerald-500" : "text-destructive"}`}
                      >
                        {isIn ? "+" : "-"}
                        {fmt(Number(r.amount))}
                      </td>
                      <td className="p-2">
                        {r.courier_id ? (couriersMap.get(r.courier_id) ?? "—") : "—"}
                      </td>
                      <td className="p-2">
                        {r.brand_id ? (brandsMap.get(r.brand_id) ?? "—") : "—"}
                      </td>
                      <td className="p-2">
                        {r.for_user_id
                          ? (actorNameById.get(r.for_user_id) ?? r.for_user_id.slice(0, 6))
                          : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.note ?? "—"}
                        {isSupplierPay && (
                          <span className="ms-1 text-[10px] text-amber-500">
                            {T(
                              "(دفعة مورد — تُدار من صفحة دفعات الموردين)",
                              "(Supplier payment — managed from the supplier payments page)",
                            )}
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        {canWrite && !isSupplierPay && r.type !== "other_out" && !isTransfer && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setForm({
                                  id: r.id,
                                  type: r.type,
                                  amount: Number(r.amount),
                                  occurred_at: r.occurred_at,
                                  brand_id: r.brand_id ?? "",
                                  courier_id: r.courier_id ?? "",
                                  for_user_id: r.for_user_id ?? "",
                                  category_id: r.category_id ?? "",
                                  platform: "",
                                  attributed_revenue: 0,
                                  supplier_id: "",
                                  wallet_id: r.wallet_id ?? "",
                                  note: r.note ?? "",
                                })
                              }
                            >
                              {T("تعديل", "Edit")}
                            </Button>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-destructive">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {T("حذف العملية", "Delete transaction")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {T(
                                      "هل أنت متأكد؟ لا يمكن التراجع.",
                                      "Are you sure? This cannot be undone.",
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => delMut.mutate(r.id)}>
                                    {T("حذف", "Delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                        {r.type === "other_out" && !isTransfer && (
                          <span className="text-[10px] text-muted-foreground">
                            {T("تُدار من صفحة المصروفات", "Managed from the expenses page")}
                          </span>
                        )}
                        {isTransfer && (
                          <span className="text-[10px] text-muted-foreground">
                            {T("تُدار من لوحة المحافظ", "Managed from the wallets panel")}
                          </span>
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
