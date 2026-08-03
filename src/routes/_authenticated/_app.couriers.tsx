import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import {
  listCouriers, upsertCourier, deleteCourier,
  listBrands,
} from "@/lib/internal.functions";
import { listCourierRates, upsertCourierRate } from "@/lib/courier-config.functions";

export const Route = createFileRoute("/_authenticated/_app/couriers")({
  head: () => ({ meta: [
    { title: "المناديب وشركات الشحن — e-GURUS" },
    { name: "description", content: "إدارة المناديب وشركات الشحن ومتابعة أدائها لكل براند." },
  ]}),
  component: CouriersPage,
});

const TYPE_LABEL: Record<string, string> = { courier_company: "شركة شحن", rep: "مندوب", offline_branch: "فرع أوفلاين" };
type CourierRateRow = {
  id: string;
  courier_id: string;
  governorate: string;
  delivery_fee: number;
  customer_return_fee: number;
  failed_delivery_fee: number;
  exchange_fee: number;
  effective_from: string;
  couriers?: { name?: string } | null;
};
const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "القليوبية", "الشرقية", "الدقهلية",
  "المنوفية", "الغربية", "كفر الشيخ", "دمياط", "بورسعيد", "الإسماعيلية",
  "السويس", "شمال سيناء", "جنوب سيناء", "البحيرة", "مطروح", "الفيوم",
  "بني سويف", "المنيا", "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان",
  "البحر الأحمر", "الوادي الجديد",
];

function CouriersPage() {
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
  const emptyRate = () => ({ id: undefined as string | undefined, courierId: "", governorate: "", deliveryFee: 0, customerReturnFee: 0, failedDeliveryFee: 0, exchangeFee: 0, effectiveFrom: getTodayInBusinessTimezone() });
  const [rate, setRate] = useState(emptyRate());
  const [editing, setEditing] = useState<null | { id?: string; name: string; type: "courier_company"|"rep"|"offline_branch"; contact: string; brand_id: string | null; brand_ids: string[]; serves_all_brands: boolean; active: boolean; opening_balance: number }>(null);

  const save = useMutation({
    mutationFn: (v: NonNullable<typeof editing>) => upC({ data: { ...v, contact: v.contact || null } }),
    onSuccess: () => { toast.success(tr("تم")); qc.invalidateQueries({ queryKey: ["couriers"] }); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delC({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }),
  });
  const saveRateMutation = useMutation({
    mutationFn: () => saveRate({ data: rate }),
    onSuccess: () => {
      toast.success(tr("تم حفظ أسعار شركة الشحن"));
      qc.invalidateQueries({ queryKey: ["courier-rates"] });
      setRateOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const brands = brandsQ.data ?? [];
  const brandName = (id: string | null) => id ? brands.find((b) => b.id === id)?.name ?? "—" : "—";
  const courierBrandsLabel = (courier: { serves_all_brands: boolean; brand_ids: string[]; brand_id: string | null }) => {
    if (courier.serves_all_brands) return "كل البراندات";
    const ids = courier.brand_ids.length ? courier.brand_ids : courier.brand_id ? [courier.brand_id] : [];
    return ids.map((id) => brandName(id)).join("، ") || "بدون براند";
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tr("المناديب وشركات الشحن")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("إضافة وإدارة المناديب وشركات الشحن. للتقارير والأداء راجع «لوحة شركات الشحن».")}</p>
        </div>
        <Button onClick={() => { setEditing({ name: "", type: "courier_company", contact: "", brand_id: null, brand_ids: [], serves_all_brands: true, active: true, opening_balance: 0 }); setOpen(true); }}>
          <Plus className="w-4 h-4 me-2" /> {tr("إضافة")}
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
                    {!c.active && <Badge variant="secondary">{tr("معطّل")}</Badge>}
                  </div>
                  {c.contact && <p className="text-xs text-muted-foreground mt-1" dir="ltr">{c.contact}</p>}
                  <p className="text-xs text-muted-foreground">{tr("يخدم:")} {courierBrandsLabel(c)}</p>
                  {Number(c.opening_balance ?? 0) !== 0 && (
                    <p className="text-xs mt-1">
                      {tr("رصيد افتتاحي:")} <span className={`num font-semibold ${Number(c.opening_balance) > 0 ? "text-emerald-600" : "text-destructive"}`}>{Number(c.opening_balance).toLocaleString("en-US")}</span>
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing({ id: c.id, name: c.name, type: c.type, contact: c.contact ?? "", brand_id: c.brand_id, brand_ids: c.brand_ids ?? (c.brand_id ? [c.brand_id] : []), serves_all_brands: c.serves_all_brands, active: c.active, opening_balance: Number(c.opening_balance ?? 0) }); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm(tr("حذف؟"))) remove.mutate(c.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </div>
            </Card>
        ))}
        {(couriersQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground col-span-full">{tr("لا يوجد. اضغط \"إضافة\".")}</p>}
      </div>

      <Card className="card-gradient p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Truck className="w-5 h-5" /> {tr("أسعار خدمات شركات الشحن")}
            </h2>
            <p className="text-xs text-muted-foreground">{tr("أربع أسعار مستقلة لكل شركة ومحافظة وتاريخ سريان.")}</p>
          </div>
          <Button
            variant="outline"
            disabled={!ratesQ.data?.ready}
            onClick={() => {
              setRate(emptyRate());
              setRateOpen(true);
            }}
          >
            <Plus className="w-4 h-4 me-2" /> {tr("إضافة سعر")}
          </Button>
        </div>

        {ratesQ.data && !ratesQ.data.ready ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            {tr("التصميم جاهز محليًا، وسيظهر جدول الأسعار بعد اعتماد وتطبيق migration قاعدة البيانات.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-muted-foreground">
                <th className="p-2 text-start">{tr("شركة الشحن")}</th>
                <th className="p-2 text-start">{tr("المحافظة")}</th>
                <th className="p-2 text-start">{tr("التسليم")}</th>
                <th className="p-2 text-start">{tr("إرجاع بعد الاستلام")}</th>
                <th className="p-2 text-start">{tr("فشل التوصيل")}</th>
                <th className="p-2 text-start">{tr("الاستبدال")}</th>
                <th className="p-2 text-start">{tr("تعديل")}</th>
              </tr></thead>
              <tbody>
                {(ratesQ.data?.rates ?? []).map((item: CourierRateRow) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="p-2">{item.couriers?.name ?? "—"}</td>
                    <td className="p-2">{item.governorate}</td>
                    <td className="p-2 num">{Number(item.delivery_fee).toLocaleString("en-US")}</td>
                    <td className="p-2 num">{Number(item.customer_return_fee).toLocaleString("en-US")}</td>
                    <td className="p-2 num">{Number(item.failed_delivery_fee).toLocaleString("en-US")}</td>
                    <td className="p-2 num">{Number(item.exchange_fee).toLocaleString("en-US")}</td>
                    <td className="p-2"><Button size="icon" variant="ghost" onClick={() => { setRate({ id: item.id, courierId: item.courier_id, governorate: item.governorate, deliveryFee: Number(item.delivery_fee), customerReturnFee: Number(item.customer_return_fee), failedDeliveryFee: Number(item.failed_delivery_fee), exchangeFee: Number(item.exchange_fee), effectiveFrom: item.effective_from }); setRateOpen(true); }}><Pencil className="w-4 h-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? "تعديل" : "إضافة"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>{tr("الاسم")}</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label>{tr("النوع")}</Label>
                <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as typeof editing.type })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="courier_company">{tr("شركة شحن")}</SelectItem>
                    <SelectItem value="rep">{tr("مندوب")}</SelectItem>
                    <SelectItem value="offline_branch">{tr("فرع أوفلاين")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{tr("وسيلة التواصل")}</Label><Input value={editing.contact} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>{tr("البراندات التي تخدمها الشركة")}</Label>
                <label className="flex items-center gap-2 rounded border p-2 text-sm">
                  <input type="checkbox" checked={editing.serves_all_brands} onChange={(event) => setEditing({ ...editing, serves_all_brands: event.target.checked, brand_ids: event.target.checked ? [] : editing.brand_ids })} />
                  {tr("كل البراندات")}
                </label>
                {!editing.serves_all_brands && <div className="grid grid-cols-2 gap-2 rounded border p-2">
                  {brands.filter((b) => b.active).map((brand) => <label key={brand.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editing.brand_ids.includes(brand.id)} onChange={(event) => setEditing({ ...editing, brand_ids: event.target.checked ? [...editing.brand_ids, brand.id] : editing.brand_ids.filter((id) => id !== brand.id), brand_id: null })} />
                    {brand.name}
                  </label>)}
                </div>}
              </div>
              <div>
                <Label>{tr("الرصيد الافتتاحي (موجب = مستحق لنا عنده، سالب = له عندنا)")}</Label>
                <Input type="number" dir="ltr" className="text-left" value={editing.opening_balance}
                  onChange={(e) => setEditing({ ...editing, opening_balance: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tr("إلغاء")}</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.name}>{tr("حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{tr("إضافة سعر شحن")}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>{tr("شركة الشحن")}</Label>
              <Select value={rate.courierId} onValueChange={(value) => setRate({ ...rate, courierId: value })}>
                <SelectTrigger><SelectValue placeholder={tr("اختر شركة الشحن")} /></SelectTrigger>
                <SelectContent>
                  {(couriersQ.data ?? []).filter((courier) => courier.active && courier.type === "courier_company").map((courier) => (
                    <SelectItem key={courier.id} value={courier.id}>{courier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr("المحافظة")}</Label>
              <Select disabled={!!rate.id} value={rate.governorate} onValueChange={(value) => setRate({ ...rate, governorate: value })}>
                <SelectTrigger><SelectValue placeholder={tr("اختر المحافظة")} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {GOVERNORATES.map((governorate) => <SelectItem key={governorate} value={governorate}>{governorate}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{tr("سعر التسليم")}</Label><Input type="number" min="0" value={rate.deliveryFee} onChange={(event) => setRate({ ...rate, deliveryFee: Number(event.target.value) })} /></div>
              <div><Label>{tr("إرجاع بعد استلام العميل")}</Label><Input type="number" min="0" value={rate.customerReturnFee} onChange={(event) => setRate({ ...rate, customerReturnFee: Number(event.target.value) })} /></div>
              <div><Label>{tr("فشل التوصيل والرجوع")}</Label><Input type="number" min="0" value={rate.failedDeliveryFee} onChange={(event) => setRate({ ...rate, failedDeliveryFee: Number(event.target.value) })} /></div>
              <div><Label>{tr("الاستبدال")}</Label><Input type="number" min="0" value={rate.exchangeFee} onChange={(event) => setRate({ ...rate, exchangeFee: Number(event.target.value) })} /></div>
            </div>
            <div><Label>{tr("ساري من")}</Label><Input disabled={!!rate.id} type="date" value={rate.effectiveFrom} onChange={(event) => setRate({ ...rate, effectiveFrom: event.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRateOpen(false)}>{tr("إلغاء")}</Button>
            <Button disabled={!rate.courierId || !rate.governorate || saveRateMutation.isPending} onClick={() => saveRateMutation.mutate()}>{tr("حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
