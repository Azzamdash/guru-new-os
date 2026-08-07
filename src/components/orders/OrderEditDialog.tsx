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

type OrderKind = "sale" | "return" | "exchange";
type ItemRow = { product_id: string; title: string; qty: number; unit_price: number };
type Product = { id: string; brand_id: string; name: string; sell_price: number | null };

const emptyItem = (): ItemRow => ({ product_id: "", title: "", qty: 1, unit_price: 0 });
const emptyForm = () => ({
  id: undefined as string | undefined,
  brand_id: "",
  order_kind: "sale" as OrderKind,
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
  // Primary list: "out" items for sale/exchange, "in" items for a plain return.
  items: [emptyItem()] as ItemRow[],
  // Only used for exchange — the "in" (returned) side.
  returnItems: [emptyItem()] as ItemRow[],
});

function itemsTotal(items: ItemRow[]) {
  return items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);
}

/** One editable list of item rows (product/qty/price), reused for both sides of an exchange. */
function ItemRowsEditor({
  items,
  onChange,
  brandProducts,
  t,
  lang,
}: {
  items: ItemRow[];
  onChange: (items: ItemRow[]) => void;
  brandProducts: Product[];
  t: (key: string) => string;
  lang: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-5">
            {brandProducts.length > 0 ? (
              <Select
                value={it.product_id || "__free"}
                onValueChange={(v) => {
                  if (v === "__free") {
                    const next = [...items];
                    next[idx] = { ...next[idx], product_id: "", title: next[idx].title };
                    onChange(next);
                    return;
                  }
                  const p = brandProducts.find((pp) => pp.id === v);
                  const next = [...items];
                  next[idx] = {
                    ...next[idx],
                    product_id: v,
                    title: p?.name ?? "",
                    unit_price: Number(p?.sell_price ?? next[idx].unit_price),
                  };
                  onChange(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("order_item_title")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__free">{lang === "ar" ? "بند حر" : "Free item"}</SelectItem>
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
                  const next = [...items];
                  next[idx] = { ...next[idx], title: e.target.value };
                  onChange(next);
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
                  const next = [...items];
                  next[idx] = { ...next[idx], title: e.target.value };
                  onChange(next);
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
                const next = [...items];
                next[idx] = { ...next[idx], qty: Number(e.target.value) };
                onChange(next);
              }}
            />
          </div>
          <div className={it.product_id === "" ? "col-span-2" : "col-span-3"}>
            <Input
              type="number"
              placeholder={t("order_item_price")}
              value={it.unit_price}
              onChange={(e) => {
                const next = [...items];
                next[idx] = { ...next[idx], unit_price: Number(e.target.value) };
                onChange(next);
              }}
            />
          </div>
          <div className="col-span-1">
            {items.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, emptyItem()])}>
        <Plus className="w-3 h-3 me-1" />
        {t("order_add_item")}
      </Button>
    </div>
  );
}

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
        const outItems = (o.items ?? []).filter((i) => i.direction !== "in");
        const inItems = (o.items ?? []).filter((i) => i.direction === "in");
        const kind = (o.order_kind ?? "sale") as OrderKind;
        setForm({
          id: o.id,
          brand_id: o.brand_id,
          order_kind: kind,
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
          // A plain return's items are stored with direction "in" (for stock
          // purposes) but still belong in the primary list here.
          items: (kind === "return" ? inItems : outItems).map((i) => ({
            product_id: i.product_id ?? "",
            title: i.title,
            qty: Number(i.qty),
            unit_price: Number(i.unit_price),
          })),
          returnItems:
            kind === "exchange" && inItems.length
              ? inItems.map((i) => ({
                  product_id: i.product_id ?? "",
                  title: i.title,
                  qty: Number(i.qty),
                  unit_price: Number(i.unit_price),
                }))
              : [emptyItem()],
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

  const isExchange = form.order_kind === "exchange";

  const create = useMutation({
    mutationFn: () => {
      if (!form.brand_id) throw new Error(lang === "ar" ? "اختر البراند" : "Choose a brand");
      const toPayloadItems = (rows: ItemRow[], direction: "out" | "in") =>
        rows
          .filter((i) => (i.title || i.product_id) && Number(i.qty) > 0)
          .map((i) => ({
            product_id: i.product_id || null,
            title: i.title || (brandProducts.find((p) => p.id === i.product_id)?.name ?? "Item"),
            qty: Number(i.qty),
            unit_price: Number(i.unit_price),
            direction,
          }));
      const primaryDirection = form.order_kind === "return" ? "in" : "out";
      const items = [
        ...toPayloadItems(form.items, primaryDirection),
        ...(isExchange ? toPayloadItems(form.returnItems, "in") : []),
      ];
      if (!items.length)
        throw new Error(lang === "ar" ? "أضف بند واحد على الأقل" : "Add at least one item");
      return createFn({
        data: {
          id: form.id,
          brand_id: form.brand_id,
          order_kind: form.order_kind,
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

  const outTotal = itemsTotal(form.items);
  const inTotal = isExchange ? itemsTotal(form.returnItems) : 0;
  const netItemsTotal = outTotal - inTotal;
  const grandTotal =
    netItemsTotal + Number(form.shipping_amount || 0) - Number(form.discount_amount || 0);

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
          <div>
            <Label className="text-xs">{lang === "ar" ? "نوع الأوردر" : "Order type"}</Label>
            <Select
              value={form.order_kind}
              onValueChange={(v) => setForm({ ...form, order_kind: v as OrderKind })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sale">{lang === "ar" ? "توصيل" : "Delivery"}</SelectItem>
                <SelectItem value="return">{lang === "ar" ? "استرجاع" : "Return"}</SelectItem>
                <SelectItem value="exchange">{lang === "ar" ? "استبدال" : "Exchange"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
            <span className="text-sm font-medium">
              {isExchange
                ? lang === "ar"
                  ? "المنتجات اللي هتتبعت للعميل"
                  : "Items going to the customer"
                : form.order_kind === "return"
                  ? lang === "ar"
                    ? "المنتجات الراجعة"
                    : "Returned items"
                  : t("invoice_items")}
            </span>
            <ItemRowsEditor
              items={form.items}
              onChange={(items) => setForm({ ...form, items })}
              brandProducts={brandProducts}
              t={t}
              lang={lang}
            />
            {isExchange && (
              <>
                <span className="text-sm font-medium">
                  {lang === "ar" ? "المنتجات اللي هترجع من العميل" : "Items coming back from the customer"}
                </span>
                <ItemRowsEditor
                  items={form.returnItems}
                  onChange={(returnItems) => setForm({ ...form, returnItems })}
                  brandProducts={brandProducts}
                  t={t}
                  lang={lang}
                />
              </>
            )}
            <div className="text-right text-sm text-muted-foreground num" dir="ltr">
              {isExchange && (
                <div>
                  Out: {outTotal.toLocaleString("en-US")} — In: {inTotal.toLocaleString("en-US")} — Net:{" "}
                  {netItemsTotal.toLocaleString("en-US")}
                </div>
              )}
              <div>Total: {grandTotal.toLocaleString("en-US")}</div>
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
