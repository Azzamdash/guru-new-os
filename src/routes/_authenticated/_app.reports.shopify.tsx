import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { listIntegrations, listShopifyOrders } from "@/lib/integrations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { RefreshCw, ShoppingBag, DollarSign, PackageCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/shopify")({
  head: () => ({ meta: [{ title: tr("تقارير Shopify — e-GURUS") }] }),
  component: ShopifyReportPage,
});

type Order = {
  id: number; name: string; created_at: string; total: number; currency: string;
  financial_status: string; fulfillment_status: string; customer: string; items: number; top_item: string;
};

function ShopifyReportPage() {
  const brandsFn = useServerFn(listBrands);
  const intsFn = useServerFn(listIntegrations);
  const ordersFn = useServerFn(listShopifyOrders);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const intsQ = useQuery({ queryKey: ["integrations"], queryFn: () => intsFn() });

  const connectedBrandIds = useMemo(
    () => new Set((intsQ.data ?? []).filter((i) => i.provider === "shopify" && i.status === "connected").map((i) => i.brand_id)),
    [intsQ.data],
  );
  const options = useMemo(
    () => (brandsQ.data ?? []).filter((b) => b.type === "product" && connectedBrandIds.has(b.id)),
    [brandsQ.data, connectedBrandIds],
  );

  const [brandId, setBrandId] = useState<string>("");
  const [days, setDays] = useState<number>(30);

  const effectiveBrand = brandId || options[0]?.id || "";

  const ordersQ = useQuery({
    queryKey: ["shopify-orders", effectiveBrand, days],
    queryFn: () => ordersFn({ data: { brand_id: effectiveBrand, days } }),
    enabled: !!effectiveBrand,
    retry: false,
  });

  const orders = (ordersQ.data?.orders ?? []) as Order[];
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const paid = orders.filter((o) => o.financial_status === "paid").length;
  const fulfilled = orders.filter((o) => o.fulfillment_status === "fulfilled").length;
  const currency = orders[0]?.currency ?? "";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShoppingBag className="w-7 h-7 text-primary" /> {tr("تقارير Shopify")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("أوردرات مباشرة من متجر Shopify للبراند المختار.")}</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={effectiveBrand} onValueChange={setBrandId}>
            <SelectTrigger className="w-48"><SelectValue placeholder={tr("اختر البراند")} /></SelectTrigger>
            <SelectContent>
              {options.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{tr("7 أيام")}</SelectItem>
              <SelectItem value="30">{tr("30 يوم")}</SelectItem>
              <SelectItem value="60">{tr("60 يوم")}</SelectItem>
              <SelectItem value="90">{tr("90 يوم")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { ordersQ.refetch(); toast.info(tr("جاري التحديث...")); }} disabled={!effectiveBrand}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon="warn"
          title={tr("لا توجد براندات مربوطة بـ Shopify")}
          description={tr("اربط أولاً حساب Shopify من صفحة التكاملات لأي براند من نوع منتجات.")}
        />
      ) : ordersQ.isError ? (
        <EmptyState
          icon="warn"
          title={tr("تعذر جلب بيانات Shopify")}
          description={ordersQ.error instanceof Error ? ordersQ.error.message : tr("خطأ غير معروف")}
          action={{ label: tr("إعادة المحاولة"), onClick: () => ordersQ.refetch() }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi icon={ShoppingBag} label={tr("عدد الأوردرات")} value={orders.length.toString()} />
            <Kpi icon={DollarSign} label={tr("إجمالي الإيرادات")} value={`${totalRevenue.toFixed(2)} ${currency}`} />
            <Kpi icon={PackageCheck} label={tr("مدفوعة")} value={`${paid} / ${orders.length}`} />
            <Kpi icon={PackageCheck} label={tr("تم الشحن")} value={`${fulfilled} / ${orders.length}`} />
          </div>

          <Card className="card-gradient overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("الرقم")}</th>
                    <th className="p-3">{tr("التاريخ")}</th>
                    <th className="p-3">{tr("العميل")}</th>
                    <th className="p-3">{tr("المنتج")}</th>
                    <th className="p-3">{tr("القطع")}</th>
                    <th className="p-3">{tr("الإجمالي")}</th>
                    <th className="p-3">{tr("الدفع")}</th>
                    <th className="p-3">{tr("الشحن")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQ.isLoading && (
                    <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">{tr("جاري التحميل...")}</td></tr>
                  )}
                  {!ordersQ.isLoading && orders.length === 0 && (
                    <tr><td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">{tr("لا أوردرات في الفترة المختارة.")}</td></tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className="p-3 font-medium" dir="ltr">{o.name}</td>
                      <td className="p-3 num" dir="ltr">{new Date(o.created_at).toLocaleDateString("en-US")}</td>
                      <td className="p-3">{o.customer}</td>
                      <td className="p-3 max-w-xs truncate">{o.top_item}</td>
                      <td className="p-3 num">{o.items}</td>
                      <td className="p-3 num">{o.total.toFixed(2)} {o.currency}</td>
                      <td className="p-3"><StatusBadge status={o.financial_status} /></td>
                      <td className="p-3"><StatusBadge status={o.fulfillment_status} kind="ship" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card className="p-4 card-gradient">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold mt-1 num">{value}</div>
        </div>
        <Icon className="w-8 h-8 text-primary/60" />
      </div>
    </Card>
  );
}

function StatusBadge({ status, kind }: { status: string; kind?: "ship" }) {
  const map: Record<string, string> = {
    paid: "مدفوع", pending: "معلّق", refunded: "مسترد", partially_paid: "دفع جزئي",
    fulfilled: "تم الشحن", unfulfilled: "لم يُشحن", partial: "جزئي", restocked: "مرتجع",
  };
  const isGood = status === "paid" || status === "fulfilled";
  const isBad = status === "refunded" || status === "restocked";
  return (
    <Badge variant={isGood ? "default" : isBad ? "destructive" : "secondary"}>
      {map[status] ?? status}
    </Badge>
  );
}
