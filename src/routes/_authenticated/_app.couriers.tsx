import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { listCouriers, upsertCourier, deleteCourier, listBrands } from "@/lib/internal.functions";
import {
  listCourierRates,
  upsertCourierRate,
  bulkUpsertCourierRates,
  getCourierRateGaps,
  recalculateCourierCharges,
} from "@/lib/courier-config.functions";

export const Route = createFileRoute("/_authenticated/_app/couriers")({
  head: () => ({
    meta: [
      { title: "المناديب وشركات الشحن — e-GURUS" },
      { name: "description", content: "إدارة المناديب وشركات الشحن ومتابعة أدائها لكل براند." },
    ],
  }),
  component: CouriersPage,
});

const TYPE_LABEL_AR: Record<string, string> = {
  courier_company: "شركة شحن",
  rep: "مندوب",
  offline_branch: "فرع أوفلاين",
};
const TYPE_LABEL_EN: Record<string, string> = {
  courier_company: "Shipping Company",
  rep: "Rep",
  offline_branch: "Offline Branch",
};
type CourierRateRow = {
  id: string;
  courier_id: string;
  governorate: string;
  delivery_fee: number;
  customer_return_fee: number;
  failed_delivery_fee: number;
  exchange_fee: number;
  effective_from: string;
  active: boolean;
  couriers?: { name?: string } | null;
};
const GOVERNORATES = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "القليوبية",
  "الشرقية",
  "الدقهلية",
  "المنوفية",
  "الغربية",
  "كفر الشيخ",
  "دمياط",
  "بورسعيد",
  "الإسماعيلية",
  "السويس",
  "شمال سيناء",
  "جنوب سيناء",
  "البحيرة",
  "مطروح",
  "الفيوم",
  "بني سويف",
  "المنيا",
  "أسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "أسوان",
  "البحر الأحمر",
  "الوادي الجديد",
];

function CouriersPage() {
  const { lang } = useLang();
  const TYPE_LABEL = lang === "ar" ? TYPE_LABEL_AR : TYPE_LABEL_EN;
  const qc = useQueryClient();
  const listC = useServerFn(listCouriers);
  const listB = useServerFn(listBrands);
  const upC = useServerFn(upsertCourier);
  const delC = useServerFn(deleteCourier);
  const listRates = useServerFn(listCourierRates);
  const saveRate = useServerFn(upsertCourierRate);
  const couriersQ = useQuery({ queryKey: ["couriers"], queryFn: () => listC() });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listB() });
  const ratesQ = useQuery({ queryKey: ["courier-rates"], queryFn: () => listRates() });

  const [open, setOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const emptyRate = () => ({
    id: undefined as string | undefined,
    courierId: "",
    governorate: "",
    deliveryFee: 0,
    customerReturnFee: 0,
    failedDeliveryFee: 0,
    exchangeFee: 0,
    effectiveFrom: getTodayInBusinessTimezone(),
  });
  const [rate, setRate] = useState(emptyRate());

  // Bulk rate card: one courier, one date, every governorate in a single save.
  const saveRatesBulk = useServerFn(bulkUpsertCourierRates);
  const listGaps = useServerFn(getCourierRateGaps);
  const gapsQ = useQuery({ queryKey: ["courier-rate-gaps"], queryFn: () => listGaps() });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCourierId, setBulkCourierId] = useState("");
  const [bulkFrom, setBulkFrom] = useState(getTodayInBusinessTimezone());
  type BulkFees = { delivery: number; customerReturn: number; failed: number; exchange: number };
  const [bulkFees, setBulkFees] = useState<Record<string, BulkFees>>({});
  const [bulkFillAll, setBulkFillAll] = useState(0);

  /**
   * Seeds the grid from whatever that courier already has, so opening it on a
   * partly-filled card shows the real numbers instead of blanking them. Only
   * active rates already in effect count, and the newest wins — the same order
   * accrue_order_courier_charge picks when it prices an order.
   */
  const openBulkFor = (courierId: string) => {
    const today = getTodayInBusinessTimezone();
    const existing = new Map<string, BulkFees>();
    for (const r of (ratesQ.data?.rates ?? []) as CourierRateRow[]) {
      if (r.courier_id !== courierId || !r.active) continue;
      if (r.effective_from > today) continue; // a future card is not what prices orders today
      const key = r.governorate.trim().toLowerCase();
      if (existing.has(key)) continue; // list arrives newest-first per governorate
      existing.set(key, {
        delivery: Number(r.delivery_fee) || 0,
        customerReturn: Number(r.customer_return_fee) || 0,
        failed: Number(r.failed_delivery_fee) || 0,
        exchange: Number(r.exchange_fee) || 0,
      });
    }
    const seeded: Record<string, BulkFees> = {};
    for (const g of GOVERNORATES) {
      seeded[g] = existing.get(g.trim().toLowerCase()) ?? {
        delivery: 0,
        customerReturn: 0,
        failed: 0,
        exchange: 0,
      };
    }
    setBulkCourierId(courierId);
    setBulkFees(seeded);
    setBulkFrom(getTodayInBusinessTimezone());
    setBulkFillAll(0);
    setBulkOpen(true);
  };

  const recalcFees = useServerFn(recalculateCourierCharges);
  const recalcMutation = useMutation({
    mutationFn: () => recalcFees({ data: {} }),
    onSuccess: (r) => {
      toast.success(
        lang === "ar"
          ? `تم إعادة تسعير ${r.updated} أوردر من الأسعار الحالية`
          : `Re-priced ${r.updated} order(s) from the current rates`,
      );
      qc.invalidateQueries({ queryKey: ["courier-rates"] });
      qc.invalidateQueries({ queryKey: ["courier-rate-gaps"] });
      qc.invalidateQueries({ queryKey: ["order-clearing"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      saveRatesBulk({
        data: {
          courierId: bulkCourierId,
          effectiveFrom: bulkFrom,
          rows: GOVERNORATES.map((g) => ({
            governorate: g,
            deliveryFee: bulkFees[g]?.delivery ?? 0,
            customerReturnFee: bulkFees[g]?.customerReturn ?? 0,
            failedDeliveryFee: bulkFees[g]?.failed ?? 0,
            exchangeFee: bulkFees[g]?.exchange ?? 0,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(
        lang === "ar" ? `تم حفظ ${r.saved} محافظة` : `Saved ${r.saved} governorate rate(s)`,
      );
      qc.invalidateQueries({ queryKey: ["courier-rates"] });
      setBulkOpen(false);
      // Saving the card alone leaves every already-delivered order on the fee it
      // accrued before, which is the whole complaint. Re-price immediately so the
      // rates take effect instead of waiting on a second, easily-missed step.
      recalcMutation.mutate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [editing, setEditing] = useState<null | {
    id?: string;
    name: string;
    type: "courier_company" | "rep" | "offline_branch";
    contact: string;
    brand_id: string | null;
    brand_ids: string[];
    serves_all_brands: boolean;
    active: boolean;
    opening_balance: number;
  }>(null);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) =>
      upC({ data: { ...v, contact: v.contact || null } }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم" : "Done");
      qc.invalidateQueries({ queryKey: ["couriers"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delC({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }),
  });
  const saveRateMutation = useMutation({
    mutationFn: () => saveRate({ data: rate }),
    onSuccess: () => {
      toast.success(lang === "ar" ? "تم حفظ أسعار شركة الشحن" : "Shipping company rates saved");
      qc.invalidateQueries({ queryKey: ["courier-rates"] });
      setRateOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const brands = brandsQ.data ?? [];
  const brandName = (id: string | null) =>
    id ? (brands.find((b) => b.id === id)?.name ?? "—") : "—";
  const courierBrandsLabel = (courier: {
    serves_all_brands: boolean;
    brand_ids: string[];
    brand_id: string | null;
  }) => {
    if (courier.serves_all_brands) return lang === "ar" ? "كل البراندات" : "All Brands";
    const ids = courier.brand_ids.length
      ? courier.brand_ids
      : courier.brand_id
        ? [courier.brand_id]
        : [];
    return (
      ids.map((id) => brandName(id)).join(lang === "ar" ? "، " : ", ") ||
      (lang === "ar" ? "بدون براند" : "No Brand")
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">
            {lang === "ar" ? "المناديب وشركات الشحن" : "Reps & Shipping Companies"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {lang === "ar"
              ? "إضافة وإدارة المناديب وشركات الشحن. للتقارير والأداء راجع «لوحة شركات الشحن»."
              : 'Add and manage reps and shipping companies. For reports and performance see the "Shipping Companies Dashboard".'}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing({
              name: "",
              type: "courier_company",
              contact: "",
              brand_id: null,
              brand_ids: [],
              serves_all_brands: true,
              active: true,
              opening_balance: 0,
            });
            setOpen(true);
          }}
        >
          <Plus className="w-4 h-4 me-2" /> {lang === "ar" ? "إضافة" : "Add"}
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(couriersQ.data ?? []).map((c) => (
          <Card key={c.id} className="card-gradient p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{c.name}</h3>
                  <Badge variant="outline">{TYPE_LABEL[c.type]}</Badge>
                  {!c.active && (
                    <Badge variant="secondary">{lang === "ar" ? "معطّل" : "Disabled"}</Badge>
                  )}
                </div>
                {c.contact && (
                  <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                    {c.contact}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {lang === "ar" ? "يخدم:" : "Serves:"} {courierBrandsLabel(c)}
                </p>
                {Number(c.opening_balance ?? 0) !== 0 && (
                  <p className="text-xs mt-1">
                    {lang === "ar" ? "رصيد افتتاحي:" : "Opening balance:"}{" "}
                    <span
                      className={`num font-semibold ${Number(c.opening_balance) > 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {Number(c.opening_balance).toLocaleString("en-US")}
                    </span>
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing({
                      id: c.id,
                      name: c.name,
                      type: c.type,
                      contact: c.contact ?? "",
                      brand_id: c.brand_id,
                      brand_ids: c.brand_ids ?? (c.brand_id ? [c.brand_id] : []),
                      serves_all_brands: c.serves_all_brands,
                      active: c.active,
                      opening_balance: Number(c.opening_balance ?? 0),
                    });
                    setOpen(true);
                  }}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(lang === "ar" ? "حذف؟" : "Delete?")) remove.mutate(c.id);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {(couriersQ.data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            {lang === "ar" ? 'لا يوجد. اضغط "إضافة".' : 'None yet. Click "Add".'}
          </p>
        )}
      </div>

      <Card className="card-gradient p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" />{" "}
              {lang === "ar" ? "أسعار خدمات شركات الشحن" : "Shipping Company Rates"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "أربع أسعار مستقلة لكل شركة ومحافظة وتاريخ سريان."
                : "Four independent fees per company, governorate, and effective date."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={!ratesQ.data?.ready}
              onClick={() => {
                setRate(emptyRate());
                setRateOpen(true);
              }}
            >
              <Plus className="w-4 h-4 me-2" /> {lang === "ar" ? "إضافة سعر" : "Add Rate"}
            </Button>
            <Button
              disabled={!ratesQ.data?.ready || (couriersQ.data ?? []).length === 0}
              onClick={() => openBulkFor((couriersQ.data ?? [])[0]?.id ?? "")}
            >
              <Truck className="w-4 h-4 me-2" />
              {lang === "ar" ? "تعبئة كل المحافظات" : "Fill all governorates"}
            </Button>
            <Button
              variant="outline"
              disabled={!ratesQ.data?.ready || recalcMutation.isPending}
              onClick={() => recalcMutation.mutate()}
            >
              {lang === "ar" ? "إعادة حساب الرسوم" : "Recalculate fees"}
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {lang === "ar"
            ? "إضافة سعر لمحافظة مش بيغيّر الأوردرات اللي اتسلّمت قبله — دوس «إعادة حساب الرسوم» بعد ما تعدّل الأسعار عشان الرسوم المفتوحة تتسعّر من جديد."
            : "Adding a rate does not change orders delivered before it — use Recalculate fees after editing rates so open charges are re-priced."}
        </p>

        {(gapsQ.data ?? []).length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
            <div className="font-medium text-amber-700 dark:text-amber-300">
              {lang === "ar"
                ? "محافظات عليها أوردرات من غير سعر — رسومها بتتحسب صفر وشحنها خارج الربح"
                : "Governorates with orders but no rate — their fee accrues as zero and their shipping is excluded from profit"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(gapsQ.data ?? []).map((g) => (
                <button
                  key={`${g.courierId}-${g.governorate}`}
                  onClick={() => openBulkFor(g.courierId)}
                  className="rounded-md border border-amber-500/40 bg-background/60 px-2 py-1 text-xs hover:bg-amber-500/20"
                >
                  {g.courierName} — {g.governorate}
                  <span className="text-muted-foreground ms-1">({g.orders})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {ratesQ.data && !ratesQ.data.ready ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            {lang === "ar"
              ? "التصميم جاهز محليًا، وسيظهر جدول الأسعار بعد اعتماد وتطبيق migration قاعدة البيانات."
              : "The design is ready locally, and the rates table will appear once the database migration is approved and applied."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-2 text-start">
                    {lang === "ar" ? "شركة الشحن" : "Shipping Company"}
                  </th>
                  <th className="p-2 text-start">{lang === "ar" ? "المحافظة" : "Governorate"}</th>
                  <th className="p-2 text-start">{lang === "ar" ? "التسليم" : "Delivery"}</th>
                  <th className="p-2 text-start">
                    {lang === "ar" ? "إرجاع بعد الاستلام" : "Return After Receipt"}
                  </th>
                  <th className="p-2 text-start">
                    {lang === "ar" ? "فشل التوصيل" : "Failed Delivery"}
                  </th>
                  <th className="p-2 text-start">{lang === "ar" ? "الاستبدال" : "Exchange"}</th>
                  <th className="p-2 text-start">{lang === "ar" ? "تعديل" : "Edit"}</th>
                </tr>
              </thead>
              <tbody>
                {(ratesQ.data?.rates ?? []).map((item: CourierRateRow) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="p-2">{item.couriers?.name ?? "—"}</td>
                    <td className="p-2">{item.governorate}</td>
                    <td className="p-2 num">{Number(item.delivery_fee).toLocaleString("en-US")}</td>
                    <td className="p-2 num">
                      {Number(item.customer_return_fee).toLocaleString("en-US")}
                    </td>
                    <td className="p-2 num">
                      {Number(item.failed_delivery_fee).toLocaleString("en-US")}
                    </td>
                    <td className="p-2 num">{Number(item.exchange_fee).toLocaleString("en-US")}</td>
                    <td className="p-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setRate({
                            id: item.id,
                            courierId: item.courier_id,
                            governorate: item.governorate,
                            deliveryFee: Number(item.delivery_fee),
                            customerReturnFee: Number(item.customer_return_fee),
                            failedDeliveryFee: Number(item.failed_delivery_fee),
                            exchangeFee: Number(item.exchange_fee),
                            effectiveFrom: item.effective_from,
                          });
                          setRateOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? (lang === "ar" ? "تعديل" : "Edit") : lang === "ar" ? "إضافة" : "Add"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>{lang === "ar" ? "الاسم" : "Name"}</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "النوع" : "Type"}</Label>
                <Select
                  value={editing.type}
                  onValueChange={(v) => setEditing({ ...editing, type: v as typeof editing.type })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="courier_company">
                      {lang === "ar" ? "شركة شحن" : "Shipping Company"}
                    </SelectItem>
                    <SelectItem value="rep">{lang === "ar" ? "مندوب" : "Rep"}</SelectItem>
                    <SelectItem value="offline_branch">
                      {lang === "ar" ? "فرع أوفلاين" : "Offline Branch"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{lang === "ar" ? "وسيلة التواصل" : "Contact"}</Label>
                <Input
                  value={editing.contact}
                  onChange={(e) => setEditing({ ...editing, contact: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {lang === "ar" ? "البراندات التي تخدمها الشركة" : "Brands This Company Serves"}
                </Label>
                <label className="flex items-center gap-2 rounded border p-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.serves_all_brands}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        serves_all_brands: event.target.checked,
                        brand_ids: event.target.checked ? [] : editing.brand_ids,
                      })
                    }
                  />
                  {lang === "ar" ? "كل البراندات" : "All Brands"}
                </label>
                {!editing.serves_all_brands && (
                  <div className="grid grid-cols-2 gap-2 rounded border p-2">
                    {brands
                      .filter((b) => b.active)
                      .map((brand) => (
                        <label key={brand.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editing.brand_ids.includes(brand.id)}
                            onChange={(event) =>
                              setEditing({
                                ...editing,
                                brand_ids: event.target.checked
                                  ? [...editing.brand_ids, brand.id]
                                  : editing.brand_ids.filter((id) => id !== brand.id),
                                brand_id: null,
                              })
                            }
                          />
                          {brand.name}
                        </label>
                      ))}
                  </div>
                )}
              </div>
              <div>
                <Label>
                  {lang === "ar"
                    ? "الرصيد الافتتاحي (موجب = مستحق لنا عنده، سالب = له عندنا)"
                    : "Opening Balance (positive = owed to us, negative = we owe them)"}
                </Label>
                <Input
                  type="number"
                  dir="ltr"
                  className="text-left"
                  value={editing.opening_balance}
                  onChange={(e) =>
                    setEditing({ ...editing, opening_balance: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => editing && save.mutate(editing)}
              disabled={save.isPending || !editing?.name}
            >
              {lang === "ar" ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{lang === "ar" ? "إضافة سعر شحن" : "Add Shipping Rate"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{lang === "ar" ? "شركة الشحن" : "Shipping Company"}</Label>
              <Select
                value={rate.courierId}
                onValueChange={(value) => setRate({ ...rate, courierId: value })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={lang === "ar" ? "اختر شركة الشحن" : "Select shipping company"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(couriersQ.data ?? [])
                    .filter((courier) => courier.active && courier.type === "courier_company")
                    .map((courier) => (
                      <SelectItem key={courier.id} value={courier.id}>
                        {courier.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{lang === "ar" ? "المحافظة" : "Governorate"}</Label>
              <Select
                disabled={!!rate.id}
                value={rate.governorate}
                onValueChange={(value) => setRate({ ...rate, governorate: value })}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={lang === "ar" ? "اختر المحافظة" : "Select governorate"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {GOVERNORATES.map((governorate) => (
                    <SelectItem key={governorate} value={governorate}>
                      {governorate}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{lang === "ar" ? "سعر التسليم" : "Delivery Fee"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={rate.deliveryFee}
                  onChange={(event) =>
                    setRate({ ...rate, deliveryFee: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <Label>
                  {lang === "ar" ? "إرجاع بعد استلام العميل" : "Return After Customer Receipt"}
                </Label>
                <Input
                  type="number"
                  min="0"
                  value={rate.customerReturnFee}
                  onChange={(event) =>
                    setRate({ ...rate, customerReturnFee: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "فشل التوصيل والرجوع" : "Failed Delivery & Return"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={rate.failedDeliveryFee}
                  onChange={(event) =>
                    setRate({ ...rate, failedDeliveryFee: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <Label>{lang === "ar" ? "الاستبدال" : "Exchange"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={rate.exchangeFee}
                  onChange={(event) =>
                    setRate({ ...rate, exchangeFee: Number(event.target.value) })
                  }
                />
              </div>
            </div>
            <div>
              <Label>{lang === "ar" ? "ساري من" : "Effective From"}</Label>
              <Input
                disabled={!!rate.id}
                type="date"
                value={rate.effectiveFrom}
                onChange={(event) => setRate({ ...rate, effectiveFrom: event.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRateOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={!rate.courierId || !rate.governorate || saveRateMutation.isPending}
              onClick={() => saveRateMutation.mutate()}
            >
              {lang === "ar" ? "حفظ" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {lang === "ar" ? "تعبئة أسعار كل المحافظات" : "Fill all governorate rates"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>{lang === "ar" ? "شركة الشحن" : "Shipping Company"}</Label>
                <Select value={bulkCourierId} onValueChange={openBulkFor}>
                  <SelectTrigger>
                    <SelectValue />
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
              <div>
                <Label>{lang === "ar" ? "ساري من" : "Effective From"}</Label>
                <Input type="date" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} />
                {/* Rates match on effective_from <= the order's date, so a card saved
                    today never reaches orders delivered earlier. That is invisible
                    until the fees come out as zero, so say it here and offer the fix. */}
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[11px] text-muted-foreground">
                    {lang === "ar"
                      ? "الأسعار مش هتسري على أوردرات قبل التاريخ ده."
                      : "Rates will not apply to orders before this date."}
                  </p>
                  <button
                    type="button"
                    className="text-[11px] underline text-primary whitespace-nowrap"
                    onClick={() => setBulkFrom(`${new Date().getFullYear()}-01-01`)}
                  >
                    {lang === "ar" ? "من أول السنة" : "Start of year"}
                  </button>
                </div>
              </div>
              <div>
                <Label>
                  {lang === "ar" ? "املأ التسليم الفاضي بـ" : "Fill empty delivery with"}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={bulkFillAll}
                    onChange={(e) => setBulkFillAll(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <Button
                    variant="outline"
                    onClick={() =>
                      setBulkFees((prev) => {
                        const next = { ...prev };
                        for (const g of GOVERNORATES) {
                          const row = next[g];
                          // Only fills blanks, so a card that is half done keeps
                          // the governorates already priced by hand.
                          if (!row || row.delivery > 0) continue;
                          next[g] = { ...row, delivery: bulkFillAll };
                        }
                        return next;
                      })
                    }
                  >
                    {lang === "ar" ? "طبّق" : "Apply"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2 text-start">{lang === "ar" ? "المحافظة" : "Governorate"}</th>
                    <th className="p-2 text-start">{lang === "ar" ? "التسليم" : "Delivery"}</th>
                    <th className="p-2 text-start">
                      {lang === "ar" ? "إرجاع بعد الاستلام" : "Return After Receipt"}
                    </th>
                    <th className="p-2 text-start">
                      {lang === "ar" ? "فشل التوصيل" : "Failed Delivery"}
                    </th>
                    <th className="p-2 text-start">{lang === "ar" ? "الاستبدال" : "Exchange"}</th>
                  </tr>
                </thead>
                <tbody>
                  {GOVERNORATES.map((g) => {
                    const row = bulkFees[g] ?? {
                      delivery: 0,
                      customerReturn: 0,
                      failed: 0,
                      exchange: 0,
                    };
                    const set = (patch: Partial<BulkFees>) =>
                      setBulkFees((prev) => ({ ...prev, [g]: { ...row, ...patch } }));
                    return (
                      <tr key={g} className="border-b border-border/50">
                        <td className="p-2 font-medium whitespace-nowrap">{g}</td>
                        {(
                          [
                            ["delivery", row.delivery],
                            ["customerReturn", row.customerReturn],
                            ["failed", row.failed],
                            ["exchange", row.exchange],
                          ] as Array<[keyof BulkFees, number]>
                        ).map(([key, value]) => (
                          <td key={key} className="p-1">
                            <Input
                              type="number"
                              className="h-8 w-24"
                              value={value}
                              onChange={(e) =>
                                set({ [key]: Math.max(0, Number(e.target.value) || 0) })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {lang === "ar"
                ? "المحافظة اللي سعرها صفر هتفضل بتتحسب صفر — سيبها صفر بس لو الشحن فعلاً مجاني."
                : "A governorate left at zero keeps accruing zero — leave it only if shipping there is genuinely free."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              disabled={!bulkCourierId || bulkMutation.isPending}
              onClick={() => bulkMutation.mutate()}
            >
              {lang === "ar" ? "حفظ كل المحافظات" : "Save all governorates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
