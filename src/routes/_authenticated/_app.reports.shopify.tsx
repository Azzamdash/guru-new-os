import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { listIntegrations, listShopifyOrders } from "@/lib/integrations.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { RefreshCw, ShoppingBag, DollarSign, PackageCheck } from "lucide-react";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/shopify")({
  head: () => ({ meta: [{ title: "تقارير Shopify — e-GURUS" }] }),
  component: ShopifyReportPage,
});

type Order = {
  id: number;
  name: string;
  created_at: string;
  total: number;
  currency: string;
  financial_status: string;
  fulfillment_status: string;
  customer: string;
  items: number;
  top_item: string;
};

function ShopifyReportPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const brandsFn = useServerFn(listBrands);
  const intsFn = useServerFn(listIntegrations);
  const ordersFn = useServerFn(listShopifyOrders);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const intsQ = useQuery({ queryKey: ["integrations"], queryFn: () => intsFn() });

  const connectedBrandIds = useMemo(
    () =>
      new Set(
        (intsQ.data ?? [])
          .filter((i) => i.provider === "shopify" && i.status === "connected")
          .map((i) => i.brand_id),
      ),
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 text-primary" />{" "}
            {T("تقارير Shopify", "Shopify Reports")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "أوردرات مباشرة من متجر Shopify للبراند المختار.",
              "Orders pulled directly from the Shopify store for the selected brand.",
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={effectiveBrand} onValueChange={setBrandId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={T("اختر البراند", "Select brand")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{T("7 أيام", "7 days")}</SelectItem>
              <SelectItem value="30">{T("30 يوم", "30 days")}</SelectItem>
              <SelectItem value="60">{T("60 يوم", "60 days")}</SelectItem>
              <SelectItem value="90">{T("90 يوم", "90 days")}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              ordersQ.refetch();
              toast.info(T("جاري التحديث...", "Refreshing..."));
            }}
            disabled={!effectiveBrand}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon="warn"
          title={T("لا توجد براندات مربوطة بـ Shopify", "No brands connected to Shopify")}
          description={T(
            "اربط أولاً حساب Shopify من صفحة التكاملات لأي براند من نوع منتجات.",
            "First connect a Shopify account from the Integrations page for any product brand.",
          )}
        />
      ) : ordersQ.isError ? (
        <EmptyState
          icon="warn"
          title={T("تعذر جلب بيانات Shopify", "Could not fetch Shopify data")}
          description={
            ordersQ.error instanceof Error
              ? ordersQ.error.message
              : T("خطأ غير معروف", "Unknown error")
          }
          action={{ label: T("إعادة المحاولة", "Retry"), onClick: () => ordersQ.refetch() }}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi
              icon={ShoppingBag}
              label={T("عدد الأوردرات", "Order count")}
              value={orders.length.toString()}
            />
            <Kpi
              icon={DollarSign}
              label={T("إجمالي الإيرادات", "Total revenue")}
              value={`${totalRevenue.toFixed(2)} ${currency}`}
            />
            <Kpi
              icon={PackageCheck}
              label={T("مدفوعة", "Paid")}
              value={`${paid} / ${orders.length}`}
            />
            <Kpi
              icon={PackageCheck}
              label={T("تم الشحن", "Shipped")}
              value={`${fulfilled} / ${orders.length}`}
            />
          </div>

          <Card className="card-gradient overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الرقم", "Number")}</th>
                    <th className="p-3">{T("التاريخ", "Date")}</th>
                    <th className="p-3">{T("العميل", "Customer")}</th>
                    <th className="p-3">{T("المنتج", "Product")}</th>
                    <th className="p-3">{T("القطع", "Items")}</th>
                    <th className="p-3">{T("الإجمالي", "Total")}</th>
                    <th className="p-3">{T("الدفع", "Payment")}</th>
                    <th className="p-3">{T("الشحن", "Shipping")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersQ.isLoading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                        {T("جاري التحميل...", "Loading...")}
                      </td>
                    </tr>
                  )}
                  {!ordersQ.isLoading && orders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                        {T("لا أوردرات في الفترة المختارة.", "No orders in the selected period.")}
                      </td>
                    </tr>
                  )}
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className="p-3 font-medium" dir="ltr">
                        {o.name}
                      </td>
                      <td className="p-3 num" dir="ltr">
                        {new Date(o.created_at).toLocaleDateString("en-US")}
                      </td>
                      <td className="p-3">{o.customer}</td>
                      <td className="p-3 max-w-xs truncate">{o.top_item}</td>
                      <td className="p-3 num">{o.items}</td>
                      <td className="p-3 num">
                        {o.total.toFixed(2)} {o.currency}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={o.financial_status} />
                      </td>
                      <td className="p-3">
                        <StatusBadge status={o.fulfillment_status} kind="ship" />
                      </td>
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

function Kpi({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
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
  const { lang } = useLang();
  const map: Record<string, string> =
    lang === "ar"
      ? {
          paid: "مدفوع",
          pending: "معلّق",
          refunded: "مسترد",
          partially_paid: "دفع جزئي",
          fulfilled: "تم الشحن",
          unfulfilled: "لم يُشحن",
          partial: "جزئي",
          restocked: "مرتجع",
        }
      : {
          paid: "Paid",
          pending: "Pending",
          refunded: "Refunded",
          partially_paid: "Partially paid",
          fulfilled: "Shipped",
          unfulfilled: "Unshipped",
          partial: "Partial",
          restocked: "Returned",
        };
  const isGood = status === "paid" || status === "fulfilled";
  const isBad = status === "refunded" || status === "restocked";
  return (
    <Badge variant={isGood ? "default" : isBad ? "destructive" : "secondary"}>
      {map[status] ?? status}
    </Badge>
  );
}
