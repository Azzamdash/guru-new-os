import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  listBrands,
  listCategories,
  listExpenseEntries,
  upsertExpenseEntry,
  deleteExpenseEntry,
  listSuppliers,
} from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { Link } from "@tanstack/react-router";
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
import { Badge } from "@/components/ui/badge";
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
import { Trash2, Plus, Lock, Wallet, Pencil } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات — e-GURUS" },
      {
        name: "description",
        content:
          "إدخال ومتابعة المصروفات لكل براند بفترات متعددة (يومي/أسبوعي/شهري/سنوي/مدة محددة) مع تحديد المنصة والإيراد المنسوب.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExpensesPage,
});

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const PLATFORM_LABELS: Record<string, { ar: string; en: string }> = {
  tiktok: { ar: "TikTok", en: "TikTok" },
  meta: { ar: "Meta", en: "Meta" },
  google: { ar: "Google", en: "Google" },
  snapchat: { ar: "Snapchat", en: "Snapchat" },
  whatsapp: { ar: "WhatsApp", en: "WhatsApp" },
  sms: { ar: "SMS", en: "SMS" },
  influencer: { ar: "انفلونسر", en: "Influencer" },
  ugc: { ar: "UGC", en: "UGC" },
  media_production: { ar: "Media Production", en: "Media Production" },
  other: { ar: "أخرى", en: "Other" },
};
type Platform =
  | "tiktok"
  | "meta"
  | "google"
  | "snapchat"
  | "whatsapp"
  | "sms"
  | "influencer"
  | "ugc"
  | "media_production"
  | "other";
type PeriodType = "daily" | "weekly" | "monthly" | "yearly" | "custom";

function today() {
  return getTodayInBusinessTimezone();
}
function addDays(dateStr: string, d: number) {
  const dt = new Date(dateStr);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

function ExpensesPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const MONTHS = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const platformLabel = (key: string) => PLATFORM_LABELS[key]?.[lang] ?? key;
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listCatsFn = useServerFn(listCategories);
  const listExpFn = useServerFn(listExpenseEntries);
  const upsertExpFn = useServerFn(upsertExpenseEntry);
  const delExpFn = useServerFn(deleteExpenseEntry);
  const getRoleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite =
    !!roleQ.data &&
    roleQ.data.roles.some((r) => ["admin", "manager", "data_entry", "accountant"].includes(r));

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const catsQ = useQuery({ queryKey: ["categories"], queryFn: () => listCatsFn() });
  const listSuppliersFn = useServerFn(listSuppliers);
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliersFn() });

  const now = new Date();
  // Filter state
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [filterPeriod, setFilterPeriod] = useState<PeriodType>("monthly");
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterFrom, setFilterFrom] = useState<string>(addDays(today(), -30));
  const [filterTo, setFilterTo] = useState<string>(today());
  const [filterDay, setFilterDay] = useState<string>(today());

  // Add/edit form state
  const [form, setForm] = useState<{
    id?: string;
    brand_id: string;
    category_id: string;
    amount: number;
    note: string;
    platform: string;
    attributed_revenue: number;
    period_type: PeriodType;
    period_date: string;
    period_end_date: string;
    supplier_id: string;
  }>({
    brand_id: "",
    category_id: "",
    amount: 0,
    note: "",
    platform: "",
    attributed_revenue: 0,
    period_type: "monthly",
    period_date: today(),
    period_end_date: today(),
    supplier_id: "",
  });

  useEffect(() => {
    if (!form.brand_id && brandsQ.data?.[0])
      setForm((f) => ({ ...f, brand_id: brandsQ.data![0].id }));
  }, [brandsQ.data, form.brand_id]);

  const filterArgs = useMemo(() => {
    if (filterPeriod === "monthly")
      return {
        brandId: brandFilter === "all" ? null : brandFilter,
        year: filterYear,
        month: filterMonth,
      };
    if (filterPeriod === "yearly")
      return { brandId: brandFilter === "all" ? null : brandFilter, year: filterYear };
    if (filterPeriod === "daily")
      return {
        brandId: brandFilter === "all" ? null : brandFilter,
        date_from: filterDay,
        date_to: filterDay,
      };
    if (filterPeriod === "weekly")
      return {
        brandId: brandFilter === "all" ? null : brandFilter,
        date_from: filterDay,
        date_to: addDays(filterDay, 6),
      };
    return {
      brandId: brandFilter === "all" ? null : brandFilter,
      date_from: filterFrom,
      date_to: filterTo,
    };
  }, [brandFilter, filterPeriod, filterYear, filterMonth, filterDay, filterFrom, filterTo]);

  const expKey = ["expense-entries", filterArgs];
  const expQ = useQuery({
    queryKey: expKey,
    queryFn: () => listExpFn({ data: filterArgs }),
  });

  const saveMut = useMutation({
    mutationFn: (payload: typeof form) => {
      const d = payload.period_date ? new Date(payload.period_date) : new Date();
      const derivedYear = d.getFullYear();
      const derivedMonth = d.getMonth() + 1;
      return upsertExpFn({
        data: {
          id: payload.id,
          brand_id: payload.brand_id,
          category_id: payload.category_id,
          year: derivedYear,
          month: derivedMonth,
          amount: payload.amount,
          note: payload.note,
          platform: (payload.platform || null) as Platform | null,
          attributed_revenue: payload.attributed_revenue,
          period_type: payload.period_type,
          period_date: payload.period_date || null,
          period_end_date: payload.period_type === "custom" ? payload.period_end_date : null,
        },
      });
    },

    onSuccess: () => {
      toast.success(form.id ? T("تم التعديل", "Updated") : T("تمت الإضافة", "Added"));
      qc.invalidateQueries({ queryKey: ["expense-entries"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
      setForm((f) => ({
        ...f,
        id: undefined,
        category_id: "",
        amount: 0,
        note: "",
        platform: "",
        attributed_revenue: 0,
        supplier_id: "",
      }));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل الحفظ", "Save failed")),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delExpFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["expense-entries"] });
      qc.invalidateQueries({ queryKey: ["cash-txns"] });
      qc.invalidateQueries({ queryKey: ["cash-summary"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
  });

  if (!canWrite && !roleQ.isLoading) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold mb-1">
            {T("لا تملك صلاحية إدخال المصروفات", "You don't have permission to enter expenses")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {T("تواصل مع المشرف.", "Contact the admin.")}
          </p>
        </Card>
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const cats = (catsQ.data ?? []).filter((c) => c.active);
  const brands = brandsQ.data ?? [];
  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const selectedCat = cats.find((c) => c.id === form.category_id);
  const catLabel = `${selectedCat?.name ?? ""} ${selectedCat?.slug ?? ""}`.toLowerCase();
  const isMarketing = /market|تسويق|ماركت|إعلان|اعلان/.test(catLabel);
  const isPurchases = /purchas|مشترى|مشتري|مشترياة|مشتريات|شراء|مورد/.test(catLabel);
  const suppliers = suppliersQ.data ?? [];
  const brandSuppliers = form.brand_id
    ? suppliers.filter((s) => !s.brand_ids?.length || s.brand_ids.includes(form.brand_id))
    : suppliers;
  const selectedSupplier = suppliers.find((s) => s.id === form.supplier_id);

  const totalSpend = (expQ.data ?? []).reduce((a, r) => a + Number(r.amount || 0), 0);
  const totalAttributed = (expQ.data ?? []).reduce(
    (a, r) => a + Number(r.attributed_revenue || 0),
    0,
  );

  const rangeLabel =
    filterPeriod === "monthly"
      ? `${MONTHS[filterMonth - 1]} ${filterYear}`
      : filterPeriod === "yearly"
        ? T(`سنة ${filterYear}`, `Year ${filterYear}`)
        : filterPeriod === "daily"
          ? T(`يوم ${filterDay}`, `Day ${filterDay}`)
          : filterPeriod === "weekly"
            ? T(`الأسبوع من ${filterDay}`, `Week from ${filterDay}`)
            : T(`من ${filterFrom} إلى ${filterTo}`, `From ${filterFrom} to ${filterTo}`);

  const startEdit = (row: NonNullable<typeof expQ.data>[number]) => {
    setForm({
      id: row.id,
      brand_id: row.brand_id,
      category_id: row.category_id,
      amount: Number(row.amount) || 0,
      note: row.note ?? "",
      platform: row.platform ?? "",
      attributed_revenue: Number(row.attributed_revenue) || 0,
      period_type: (row.period_type as PeriodType) || "monthly",
      period_date: row.period_date ?? today(),
      period_end_date: row.period_end_date ?? today(),
      supplier_id: "",
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Wallet className="w-7 h-7 text-primary" /> {T("المصروفات", "Expenses")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {T(
            "إدخال المصروفات بفترات متعددة لكل براند أو لكل البراندات، مع تحديد المنصة والإيراد المنسوب للحملات.",
            "Enter expenses over multiple periods for one brand or all brands, specifying the platform and campaign-attributed revenue.",
          )}
        </p>
      </div>

      {/* FILTER */}
      <Card className="card-gradient p-5">
        <div className="grid md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <Label>{T("البراند", "Brand")}</Label>
            <Select value={brandFilter} onValueChange={setBrandFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T("كل البراندات", "All Brands")}</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("الفترة", "Period")}</Label>
            <Select value={filterPeriod} onValueChange={(v) => setFilterPeriod(v as PeriodType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{T("يومي", "Daily")}</SelectItem>
                <SelectItem value="weekly">{T("أسبوعي", "Weekly")}</SelectItem>
                <SelectItem value="monthly">{T("شهري", "Monthly")}</SelectItem>
                <SelectItem value="yearly">{T("سنوي", "Yearly")}</SelectItem>
                <SelectItem value="custom">{T("مدة محددة", "Custom range")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filterPeriod === "daily" || filterPeriod === "weekly") && (
            <div className="md:col-span-3">
              <Label>
                {filterPeriod === "weekly"
                  ? T("بداية الأسبوع", "Week start")
                  : T("التاريخ", "Date")}
              </Label>
              <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} />
            </div>
          )}
          {filterPeriod === "custom" && (
            <>
              <div>
                <Label>{T("من", "From")}</Label>
                <Input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                />
              </div>
              <div>
                <Label>{T("إلى", "To")}</Label>
                <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
              </div>
            </>
          )}
          {(filterPeriod === "monthly" || filterPeriod === "yearly") && (
            <>
              <div>
                <Label>{T("السنة", "Year")}</Label>
                <Select
                  value={String(filterYear)}
                  onValueChange={(v) => setFilterYear(parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {filterPeriod === "monthly" && (
                <div>
                  <Label>{T("الشهر", "Month")}</Label>
                  <Select
                    value={String(filterMonth)}
                    onValueChange={(v) => setFilterMonth(parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">
            {T("إجمالي المصروفات", "Total Expenses")}
          </div>
          <div className="text-2xl font-bold mt-1">
            {totalSpend.toLocaleString("en-US")} {T("جنيه", "EGP")}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{rangeLabel}</div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">
            {T("الإيراد المنسوب للحملات", "Campaign-Attributed Revenue")}
          </div>
          <div className="text-2xl font-bold mt-1">
            {totalAttributed.toLocaleString("en-US")} {T("جنيه", "EGP")}
          </div>
        </Card>
        <Card className="card-gradient p-5">
          <div className="text-xs text-muted-foreground">
            {T("عدد بنود المصروفات", "Number of Expense Items")}
          </div>
          <div className="text-2xl font-bold mt-1">{(expQ.data ?? []).length}</div>
        </Card>
      </div>

      {/* ADD/EDIT */}
      <Card className="card-gradient p-5 space-y-4">
        <h3 className="font-semibold">
          {form.id ? T("تعديل بند", "Edit Item") : T("إضافة بند جديد", "Add New Item")}
        </h3>
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>{T("البراند *", "Brand *")}</Label>
            <Select value={form.brand_id} onValueChange={(v) => setForm({ ...form, brand_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder={T("اختر", "Select")} />
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
            <Label>{T("البند *", "Category *")}</Label>
            <Select
              value={form.category_id}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  category_id: v,
                  platform: "",
                  attributed_revenue: 0,
                  supplier_id: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={T("اختر", "Select")} />
              </SelectTrigger>
              <SelectContent>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("نوع الفترة", "Period Type")}</Label>
            <Select
              value={form.period_type}
              onValueChange={(v) => setForm({ ...form, period_type: v as PeriodType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{T("يومي", "Daily")}</SelectItem>
                <SelectItem value="weekly">{T("أسبوعي", "Weekly")}</SelectItem>
                <SelectItem value="monthly">{T("شهري", "Monthly")}</SelectItem>
                <SelectItem value="yearly">{T("سنوي", "Yearly")}</SelectItem>
                <SelectItem value="custom">{T("مدة محددة", "Custom range")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {form.period_type === "custom"
                ? T("من", "From")
                : form.period_type === "weekly"
                  ? T("بداية الأسبوع", "Week start")
                  : T("التاريخ", "Date")}
            </Label>
            <Input
              type="date"
              value={form.period_date}
              onChange={(e) => setForm({ ...form, period_date: e.target.value })}
            />
          </div>
          {form.period_type === "custom" && (
            <div>
              <Label>{T("إلى", "To")}</Label>
              <Input
                type="date"
                value={form.period_end_date}
                onChange={(e) => setForm({ ...form, period_end_date: e.target.value })}
              />
            </div>
          )}

          <NumField
            label={T("المبلغ *", "Amount *")}
            value={form.amount}
            onChange={(v) => setForm({ ...form, amount: v })}
          />
          {isMarketing && (
            <>
              <div>
                <Label>{T("المنصة *", "Platform *")}</Label>
                <Select
                  value={form.platform}
                  onValueChange={(v) => setForm({ ...form, platform: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={T("اختر", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(PLATFORM_LABELS).map((v) => (
                      <SelectItem key={v} value={v}>
                        {platformLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <NumField
                label={T("الإيراد المنسوب", "Attributed Revenue")}
                value={form.attributed_revenue}
                onChange={(v) => setForm({ ...form, attributed_revenue: v })}
              />
            </>
          )}
          {isPurchases && (
            <>
              <div>
                <Label>{T("المورد *", "Supplier *")}</Label>
                <Select
                  value={form.supplier_id}
                  onValueChange={(v) => setForm({ ...form, supplier_id: v })}
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
              <div className="md:col-span-1 flex items-end">
                <Link to="/purchases" className="text-xs text-primary underline hover:no-underline">
                  {T(
                    "فتح فواتير المشتريات لإدخال الأصناف بالتفصيل ↗",
                    "Open purchase invoices to enter items in detail ↗",
                  )}
                </Link>
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <Label>{T("ملاحظة", "Note")}</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (!form.brand_id) return toast.error(T("اختر البراند", "Select a brand"));
              if (!form.category_id || form.amount <= 0)
                return toast.error(
                  T("اختر بند ومبلغ صحيح", "Select a category and a valid amount"),
                );
              if (isMarketing && !form.platform)
                return toast.error(T("اختر المنصة الإعلانية", "Select the ad platform"));
              if (isPurchases && !form.supplier_id)
                return toast.error(T("اختر المورد", "Select a supplier"));
              const supplierPrefix =
                isPurchases && selectedSupplier
                  ? T(`مورد: ${selectedSupplier.name}`, `Supplier: ${selectedSupplier.name}`)
                  : "";
              const merged = supplierPrefix
                ? form.note
                  ? `${supplierPrefix} — ${form.note}`
                  : supplierPrefix
                : form.note;
              saveMut.mutate({ ...form, note: merged });
            }}
            disabled={saveMut.isPending}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />{" "}
            {form.id ? T("حفظ التعديل", "Save Changes") : T("إضافة", "Add")}
          </Button>
          {form.id && (
            <Button
              variant="ghost"
              onClick={() =>
                setForm({
                  ...form,
                  id: undefined,
                  category_id: "",
                  amount: 0,
                  note: "",
                  platform: "",
                  attributed_revenue: 0,
                  supplier_id: "",
                })
              }
            >
              {T("إلغاء", "Cancel")}
            </Button>
          )}
        </div>
        {isMarketing && (
          <p className="text-xs text-muted-foreground">
            💡{" "}
            {T(
              "الإيراد المنسوب هو الإيراد الآتي من هذه الحملة/المنصة. يُستخدم في حساب ROI/ROAS المنسوب فقط ولا يُجمَع مع إيراد البراند الكلي.",
              "Attributed revenue is the revenue coming from this campaign/platform. It's used only to calculate attributed ROI/ROAS and is not added to the brand's total revenue.",
            )}
          </p>
        )}
      </Card>

      {/* TABLE */}
      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T(`بنود ${rangeLabel}`, `Items for ${rangeLabel}`)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{T("التاريخ / الفترة", "Date / Period")}</th>
                <th className="p-3">{T("البراند", "Brand")}</th>
                <th className="p-3">{T("البند", "Category")}</th>
                <th className="p-3">{T("المنصة", "Platform")}</th>
                <th className="p-3 text-left">{T("المبلغ", "Amount")}</th>
                <th className="p-3 text-left">{T("الإيراد المنسوب", "Attributed Revenue")}</th>
                <th className="p-3">{T("ملاحظة", "Note")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(expQ.data ?? []).map((e) => {
                const cat = cats.find((c) => c.id === e.category_id);
                const periodLabel =
                  e.period_type === "monthly"
                    ? `${MONTHS[e.month - 1]} ${e.year}`
                    : e.period_type === "yearly"
                      ? T(`سنة ${e.year}`, `Year ${e.year}`)
                      : e.period_type === "custom"
                        ? `${e.period_date} → ${e.period_end_date}`
                        : e.period_type === "weekly"
                          ? T(`أسبوع ${e.period_date}`, `Week ${e.period_date}`)
                          : (e.period_date ?? `${MONTHS[e.month - 1]} ${e.year}`);
                return (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="p-3 num" dir="ltr">
                      {periodLabel}
                    </td>
                    <td className="p-3">{brandName(e.brand_id)}</td>
                    <td className="p-3">{cat?.name ?? "—"}</td>
                    <td className="p-3">
                      {e.platform ? (
                        <Badge variant="secondary">{platformLabel(e.platform)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 num text-left">
                      {Number(e.amount).toLocaleString("en-US")}
                    </td>
                    <td className="p-3 num text-left">
                      {Number(e.attributed_revenue || 0).toLocaleString("en-US")}
                    </td>
                    <td className="p-3 text-muted-foreground">{e.note ?? ""}</td>
                    <td className="p-3 text-left flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(e)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <ConfirmDelete onConfirm={() => delMut.mutate(e.id)} />
                    </td>
                  </tr>
                );
              })}
              {(expQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">
                    {T("لا مصروفات في هذه الفترة.", "No expenses in this period.")}
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

function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{T("تأكيد الحذف", "Confirm Deletion")}</AlertDialogTitle>
          <AlertDialogDescription>
            {T(
              "هل تريد حذف هذا البند نهائياً؟ لا يمكن التراجع.",
              "Do you want to permanently delete this item? This cannot be undone.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{T("حذف", "Delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        dir="ltr"
        className="text-left"
      />
    </div>
  );
}
