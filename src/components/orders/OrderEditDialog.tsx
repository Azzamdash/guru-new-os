import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getOrder, upsertManualOrder } from "@/lib/orders.functions";
import { listBrands, listProducts, listCouriers } from "@/lib/internal.functions";
import { useLang } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { queryPresets } from "@/lib/query-presets";
import { FF, FIN, CONFIRM, EG_GOVERNORATES } from "./order-form-constants";

const emptyItem = () => ({ product_id: "", title: "", qty: 1, unit_price: 0 });
const emptyForm = () => ({
  id: undefined as string | undefined,
  brand_id: "",
  external_order_number: "",
  customer_name: "",
  customer_phone: "",
  shipping_governorate: "",
  shipping_area: "",
  shipping_address: "",
  building_number: "",
  floor_number: "",
  apartment_number: "",
  courier_id: "",
  occurred_at: getTodayInBusinessTimezone(),
  fulfillment_status: "unfulfilled",
  financial_status: "pending",
  confirmation_status: "pending",
  shipping_amount: 0,
  discount_amount: 0,
  note: "",
  items: [emptyItem()] as Array<{
    product_id: string;
    title: string;
    qty: number;
    unit_price: number;
  }>,
});

/** Create/edit an order — same dialog used across Order Distribution and My Orders. */
export function OrderEditDialog({
  open,
  orderId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  orderId: string | null;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const getOrderFn = useServerFn(getOrder);
  const createFn = useServerFn(upsertManualOrder);
  const brandsFn = useServerFn(listBrands);
  const listProductsFn = useServerFn(listProducts);
  const listCouriersFn = useServerFn(listCouriers);

  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!orderId) {
      setForm(emptyForm());
      return;
    }
    let cancelled = false;
    setLoading(true);
    getOrderFn({ data: { id: orderId } })
      .then((o) => {
        if (cancelled) return;
        setForm({
          id: o.id,
          brand_id: o.brand_id,
          external_order_number: o.external_order_number ?? "",
          customer_name: o.customer_name ?? "",
          customer_phone: o.customer_phone ?? "",
          shipping_governorate:
            (o as { shipping_governorate?: string | null }).shipping_governorate ?? "",
          shipping_area: "",
          shipping_address: (o as { shipping_address?: string | null }).shipping_address ?? "",
          building_number: (o as { building_number?: string | null }).building_number ?? "",
          floor_number: (o as { floor_number?: string | null }).floor_number ?? "",
          apartment_number: (o as { apartment_number?: string | null }).apartment_number ?? "",
          courier_id: o.courier_id ?? "",
          occurred_at: (o.occurred_at ?? new Date().toISOString()).slice(0, 10),
          fulfillment_status: o.fulfillment_status ?? "unfulfilled",
          financial_status: o.financial_status ?? "pending",
          confirmation_status: o.confirmation_status ?? "pending",
          shipping_amount: Number(o.shipping_amount ?? 0),
          discount_amount: Number(o.discount_amount ?? 0),
          note: o.note ?? "",
          items: (o.items ?? []).map((i) => ({
            product_id: i.product_id ?? "",
            title: i.title,
            qty: Number(i.qty),
            unit_price: Number(i.unit_price),
          })),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const brandsQ = useQuery({
    queryKey: ["brands"],
    queryFn: () => brandsFn(),
    ...queryPresets.reference,
  });
  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: () => listProductsFn(),
    enabled: open,
    ...queryPresets.reference,
  });
  const brandProducts = (productsQ.data ?? []).filter(
    (p) => !form.brand_id || p.brand_id === form.brand_id,
  );
  const couriersQ = useQuery({
    queryKey: ["couriers"],
    queryFn: () => listCouriersFn(),
    ...queryPresets.reference,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!form.brand_id) throw new Error(lang === "ar" ? "اختر البراند" : "Choose a brand");
      const items = form.items
        .filter((i) => (i.title || i.product_id) && Number(i.qty) > 0)
        .map((i) => ({
          product_id: i.product_id || null,
          title: i.title || (brandProducts.find((p) => p.id === i.product_id)?.name ?? "Item"),
          qty: Number(i.qty),
          unit_price: Number(i.unit_price),
        }));
      if (!items.length)
        throw new Error(lang === "ar" ? "أضف بند واحد على الأقل" : "Add at least one item");
      return createFn({
        data: {
          id: form.id,
          brand_id: form.brand_id,
          external_order_number: form.external_order_number || null,
          customer_name: form.customer_name || null,
          customer_phone: form.customer_phone || null,
          shipping_governorate: form.shipping_governorate || null,
          shipping_address:
            [form.shipping_area, form.shipping_address].filter(Boolean).join(" - ") || null,
          building_number: form.building_number || null,
          floor_number: form.floor_number || null,
          apartment_number: form.apartment_number || null,
          courier_id: form.courier_id || null,
          fulfillment_status: form.fulfillment_status,
          financial_status: form.financial_status,
          confirmation_status: form.confirmation_status,
          shipping_amount: Number(form.shipping_amount) || 0,
          discount_amount: Number(form.discount_amount) || 0,
          occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
          note: form.note || null,
          items,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("order_saved"));
      onOpenChange(false);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders-summary"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["ops-snapshot"] });
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setForm(emptyForm());
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.id ? (lang === "ar" ? "تعديل أوردر" : "Edit order") : t("order_new_title")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("order_new_hint")}</p>
        <div className="grid gap-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("brand")}</Label>
              <Select
                value={form.brand_id}
                onValueChange={(v) => setForm({ ...form, brand_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("select_placeholder")} />
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
              <Label className="text-xs">
                {lang === "ar" ? "رقم الأوردر (اختياري)" : "Order number (optional)"}
              </Label>
              <Input
                value={form.external_order_number}
                onChange={(e) => setForm({ ...form, external_order_number: e.target.value })}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">{t("customer_name_label")}</Label>
              <Input
                value={form.customer_name}
                onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("customer_phone_label")}</Label>
              <Input
                value={form.customer_phone}
                onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "المحافظة" : "Governorate"}</Label>
              <Select
                value={form.shipping_governorate || "none"}
                onValueChange={(v) =>
                  setForm({ ...form, shipping_governorate: v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={lang === "ar" ? "اختر المحافظة" : "Select governorate"}
                  />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">— {lang === "ar" ? "بدون" : "None"} —</SelectItem>
                  {EG_GOVERNORATES.map((g) => (
                    <SelectItem key={g.en} value={lang === "ar" ? g.ar : g.en}>
                      {lang === "ar" ? g.ar : g.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "المنطقة" : "Area"}</Label>
              <Input
                value={form.shipping_area}
                onChange={(e) => setForm({ ...form, shipping_area: e.target.value })}
                placeholder={lang === "ar" ? "مثال: مدينة نصر" : "e.g. Nasr City"}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">
                {lang === "ar" ? "العنوان بالتفصيل (الشارع)" : "Street address"}
              </Label>
              <Input
                value={form.shipping_address}
                onChange={(e) => setForm({ ...form, shipping_address: e.target.value })}
                placeholder={lang === "ar" ? "اسم الشارع والحي" : "Street name / landmark"}
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "المبنى / العقار" : "Building #"}</Label>
              <Input
                value={form.building_number}
                onChange={(e) => setForm({ ...form, building_number: e.target.value })}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "الدور" : "Floor"}</Label>
              <Input
                value={form.floor_number}
                onChange={(e) => setForm({ ...form, floor_number: e.target.value })}
                dir="ltr"
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "رقم الشقة" : "Apartment"}</Label>
              <Input
                value={form.apartment_number}
                onChange={(e) => setForm({ ...form, apartment_number: e.target.value })}
                dir="ltr"
              />
            </div>

            <div>
              <Label className="text-xs">{t("order_courier")}</Label>
              <Select
                value={form.courier_id || "none"}
                onValueChange={(v) => setForm({ ...form, courier_id: v === "none" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— {lang === "ar" ? "بدون" : "None"} —</SelectItem>
                  {(couriersQ.data ?? [])
                    .filter((c) => c.active)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("date")}</Label>
              <Input
                type="date"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">{t("order_status_fulfillment")}</Label>
              <Select
                value={form.fulfillment_status}
                onValueChange={(v) => setForm({ ...form, fulfillment_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FF.map((f) => (
                    <SelectItem key={f.v} value={f.v}>
                      {t(f.k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "حالة الأوردر" : "Order status"}</Label>
              <Select
                value={form.confirmation_status}
                onValueChange={(v) => setForm({ ...form, confirmation_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIRM.map((c) => (
                    <SelectItem key={c.v} value={c.v}>
                      {lang === "ar" ? c.labelAr : c.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("order_status_financial")}</Label>
              <Select
                value={form.financial_status}
                onValueChange={(v) => setForm({ ...form, financial_status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIN.map((f) => (
                    <SelectItem key={f.v} value={f.v}>
                      {t(f.k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("order_shipping_amount")}</Label>
              <Input
                type="number"
                value={form.shipping_amount}
                onChange={(e) => setForm({ ...form, shipping_amount: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">{lang === "ar" ? "خصم" : "Discount"}</Label>
              <Input
                type="number"
                value={form.discount_amount}
                onChange={(e) => setForm({ ...form, discount_amount: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("invoice_items")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })}
              >
                <Plus className="w-3 h-3 me-1" />
                {t("order_add_item")}
              </Button>
            </div>
            {form.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  {brandProducts.length > 0 ? (
                    <Select
                      value={it.product_id || "__free"}
                      onValueChange={(v) => {
                        if (v === "__free") {
                          const items = [...form.items];
                          items[idx] = {
                            ...items[idx],
                            product_id: "",
                            title: items[idx].title,
                          };
                          setForm({ ...form, items });
                          return;
                        }
                        const p = brandProducts.find((pp) => pp.id === v);
                        const items = [...form.items];
                        items[idx] = {
                          ...items[idx],
                          product_id: v,
                          title: p?.name ?? "",
                          unit_price: Number(p?.sell_price ?? items[idx].unit_price),
                        };
                        setForm({ ...form, items });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("order_item_title")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__free">
                          {lang === "ar" ? "بند حر" : "Free item"}
                        </SelectItem>
                        {brandProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder={t("order_item_title")}
                      value={it.title}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...items[idx], title: e.target.value };
                        setForm({ ...form, items });
                      }}
                    />
                  )}
                </div>
                {it.product_id === "" && (
                  <div className="col-span-3">
                    <Input
                      placeholder={t("order_item_title")}
                      value={it.title}
                      onChange={(e) => {
                        const items = [...form.items];
                        items[idx] = { ...items[idx], title: e.target.value };
                        setForm({ ...form, items });
                      }}
                    />
                  </div>
                )}
                <div className={it.product_id === "" ? "col-span-2" : "col-span-3"}>
                  <Input
                    type="number"
                    min="1"
                    placeholder={t("order_item_qty")}
                    value={it.qty}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = { ...items[idx], qty: Number(e.target.value) };
                      setForm({ ...form, items });
                    }}
                  />
                </div>
                <div className={it.product_id === "" ? "col-span-2" : "col-span-3"}>
                  <Input
                    type="number"
                    placeholder={t("order_item_price")}
                    value={it.unit_price}
                    onChange={(e) => {
                      const items = [...form.items];
                      items[idx] = { ...items[idx], unit_price: Number(e.target.value) };
                      setForm({ ...form, items });
                    }}
                  />
                </div>
                <div className="col-span-1">
                  {form.items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
                      }
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="text-right text-sm text-muted-foreground num" dir="ltr">
              Total:{" "}
              {(
                form.items.reduce(
                  (s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0),
                  0,
                ) +
                Number(form.shipping_amount || 0) -
                Number(form.discount_amount || 0)
              ).toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <Label className="text-xs">{lang === "ar" ? "ملاحظة" : "Note"}</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || loading}>
            {t("order_save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
