import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
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
import { Truck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { queryPresets } from "@/lib/query-presets";
import { addShipmentAttempt, recordCollection } from "@/lib/orders-management.functions";
import { OrderSearchCombobox } from "@/components/orders/OrderSearchCombobox";
import { useLang } from "@/lib/i18n";
import { useOrderTimeline } from "@/lib/order-timeline.shared";

const searchSchema = z.object({
  orderId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_app/order-shipping")({
  head: () => ({
    meta: [
      { title: "الشحن والتحصيل — e-GURUS" },
      {
        name: "description",
        content: "تسجيل محاولات الشحن والتحصيلات لكل أوردر.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: searchSchema,
  component: Page,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const COLLECTION_METHODS = [
  { value: "cod", label: "دفع عند الاستلام (COD)", labelEn: "Cash on delivery (COD)" },
  { value: "cash", label: "كاش", labelEn: "Cash" },
  { value: "bank_transfer", label: "تحويل بنكي", labelEn: "Bank transfer" },
  { value: "vodafone_cash", label: "فودافون كاش", labelEn: "Vodafone Cash" },
  { value: "instapay", label: "إنستاباي", labelEn: "InstaPay" },
  { value: "card", label: "بطاقة / فيزا", labelEn: "Card / Visa" },
  { value: "other", label: "أخرى", labelEn: "Other" },
] as const;

function Page() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const active = search.orderId ?? "";
  const setActive = (id: string) => navigate({ search: { orderId: id || undefined } });

  const [tracking, setTracking] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cod");
  const timeline = useOrderTimeline(active);

  const addShip = useServerFn(addShipmentAttempt);
  const addColl = useServerFn(recordCollection);

  const shipMut = useMutation({
    mutationFn: () => addShip({ data: { orderId: active, tracking: tracking || null } }),
    onSuccess: () => {
      toast.success(t("تم تسجيل محاولة شحن جديدة", "New shipment attempt recorded"));
      setTracking("");
      qc.invalidateQueries({ queryKey: ["order-timeline", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const collMut = useMutation({
    mutationFn: () => addColl({ data: { orderId: active, amount: Number(amount), method } }),
    onSuccess: () => {
      toast.success(t("تم تسجيل التحصيل", "Collection recorded"));
      setAmount("");
      qc.invalidateQueries({ queryKey: ["order-timeline", active] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">{t("الشحن والتحصيل", "Shipping & Collection")}</h1>

      <Card className="p-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>{t("ابحث عن الأوردر", "Search for an order")}</Label>
          <OrderSearchCombobox value={active} onSelect={(o) => setActive(o.id)} />
        </div>
      </Card>

      {active ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4 space-y-3">
            <div className="font-semibold">{t("محاولات الشحن", "Shipment attempts")}</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th>#</th>
                  <th>{t("الحالة", "Status")}</th>
                  <th>{t("التتبع", "Tracking")}</th>
                  <th>{t("المتوقع", "Expected")}</th>
                </tr>
              </thead>
              <tbody>
                {(timeline.data?.shipments ?? []).map((s) => (
                  <tr key={s.id} className="border-b last:border-0 text-center">
                    <td className="py-1">{s.attempt_no}</td>
                    <td>{s.status}</td>
                    <td>{s.tracking ?? "—"}</td>
                    <td className="tabular-nums">{nf(Number(s.expected_cod))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-end gap-2">
              <div className="space-y-1 flex-1">
                <Label>{t("رقم التتبع", "Tracking number")}</Label>
                <Input value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </div>
              <Button onClick={() => shipMut.mutate()} disabled={shipMut.isPending}>
                <Truck className="h-4 w-4 me-1" /> {t("محاولة شحن", "Shipment attempt")}
              </Button>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="font-semibold">{t("التحصيلات", "Collections")}</div>
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th>{t("المبلغ", "Amount")}</th>
                  <th>{t("الطريقة", "Method")}</th>
                  <th>{t("التاريخ", "Date")}</th>
                </tr>
              </thead>
              <tbody>
                {(timeline.data?.collections ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0 text-center">
                    <td className="py-1 tabular-nums">{nf(Number(c.amount))}</td>
                    <td>{c.method}</td>
                    <td className="tabular-nums">
                      {new Date(c.collected_at).toLocaleDateString("en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[120px]">
                <Label>{t("المبلغ المحصّل", "Amount collected")}</Label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1 min-w-[150px]">
                <Label>{t("طريقة التحصيل", "Collection method")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLLECTION_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {t(m.label, m.labelEn)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => collMut.mutate()} disabled={collMut.isPending}>
                <Wallet className="h-4 w-4 me-1" /> {t("تسجيل تحصيل", "Record collection")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
