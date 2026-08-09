import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  AlertTriangle,
  Boxes,
  HandCoins,
  Truck,
  Activity,
  Clock3,
  Wallet,
} from "lucide-react";
import { queryPresets } from "@/lib/query-presets";
import { getStuckOrdersAlerts } from "@/lib/orders-management.functions";
import { getOperationsSnapshot } from "@/lib/operations.functions";
import { getDataHealth } from "@/lib/data-health.functions";
import { getSupplierDebtSummary } from "@/lib/command-center.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/command-center")({
  head: () => ({
    meta: [
      { title: "مركز التحكم — e-GURUS" },
      {
        name: "description",
        content: "نظرة سريعة على كل ما يحتاج تدخل الآن، ونبض التشغيل اليومي.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CommandCenterPage,
});

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

function CommandCenterPage() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  const stuckFn = useServerFn(getStuckOrdersAlerts);
  const stuck = useQuery({
    queryKey: ["command-center", "stuck-orders"],
    queryFn: () => stuckFn({ data: {} }),
    ...queryPresets.report,
  });

  const opsFn = useServerFn(getOperationsSnapshot);
  const ops = useQuery({
    queryKey: ["command-center", "operations-snapshot"],
    queryFn: () => opsFn({ data: {} }),
    ...queryPresets.report,
  });

  const healthFn = useServerFn(getDataHealth);
  const health = useQuery({
    queryKey: ["command-center", "data-health"],
    queryFn: () => healthFn(),
    ...queryPresets.report,
  });

  const debtFn = useServerFn(getSupplierDebtSummary);
  const debt = useQuery({
    queryKey: ["command-center", "supplier-debt"],
    queryFn: () => debtFn(),
    ...queryPresets.report,
  });

  const loading = stuck.isLoading || ops.isLoading || health.isLoading || debt.isLoading;

  const delayedOrdersPreview = [
    ...(stuck.data?.noShipment ?? []),
    ...(stuck.data?.uncollected ?? []),
  ]
    .slice(0, 3)
    .map(
      (o) =>
        `${o.customerName ?? t("بدون اسم", "No name")} · ${t(`${o.daysStuck} يوم`, `${o.daysStuck}d`)}`,
    );

  const lowStockPreview = (ops.data?.inventory ?? [])
    .filter((p) => p.status !== "ok")
    .slice(0, 3)
    .map((p) => `${p.name} · ${nf(Math.max(0, p.stock))} ${p.unit}`);

  const supplierDebtPreview = (debt.data?.topSuppliers ?? [])
    .slice(0, 3)
    .map((s) => `${s.name} · ${nf(s.outstanding)} ${t("ج.م", "EGP")}`);

  const attentionCards = [
    {
      key: "orders",
      to: "/orders-attention" as const,
      icon: AlertTriangle,
      title: t("أوردرات متأخرة", "Delayed orders"),
      hint: t("بدون شحنة أو بدون تحصيل كامل", "No shipment or not fully collected"),
      count: stuck.data?.total ?? 0,
      preview: delayedOrdersPreview,
    },
    {
      key: "stock",
      to: "/inventory-management" as const,
      icon: Boxes,
      title: t("مخزون منخفض", "Low stock"),
      hint: t("منتجات وصلت أو اقتربت من حد إعادة الطلب", "Products at or near reorder point"),
      count: ops.data?.kpis.lowCount ?? 0,
      preview: lowStockPreview,
    },
    {
      key: "suppliers",
      to: "/suppliers/payments" as const,
      icon: HandCoins,
      title: t("مديونية موردين متأخرة", "Overdue supplier debt"),
      hint: debt.data
        ? t(
            `إجمالي المديونية ${nf(debt.data.totalOutstanding)} ج.م`,
            `Total outstanding ${nf(debt.data.totalOutstanding)} EGP`,
          )
        : t("إجمالي المديونية القائمة", "Total outstanding balance"),
      count: debt.data?.overdueCount ?? 0,
      preview: supplierDebtPreview,
    },
    {
      key: "settlements",
      to: "/courier-settlements" as const,
      icon: Truck,
      title: t("تسويات معلقة", "Pending settlements"),
      hint: health.data
        ? t(
            `كاش عند الشحن مفتوح ${nf(health.data.couriers.totalOpenCod)} ج.م`,
            `Open COD ${nf(health.data.couriers.totalOpenCod)} EGP`,
          )
        : t("فواتير لم تتم تسويتها بعد", "Invoices not yet reconciled"),
      count: health.data?.couriers.unreconciledInvoices ?? 0,
      preview: [] as string[],
    },
  ];

  const pulse = [
    {
      key: "active",
      icon: Activity,
      label: t("أوردرات في المسار", "Active in pipeline"),
      value: ops.data ? nf(ops.data.kpis.activeCount) : "—",
    },
    {
      key: "breached",
      icon: Clock3,
      label: t("تجاوزت SLA", "SLA breached"),
      value: ops.data ? nf(ops.data.kpis.breachedCount) : "—",
    },
    {
      key: "lead",
      icon: Gauge,
      label: t("متوسط زمن التنفيذ", "Avg fulfillment time"),
      value: ops.data ? `${ops.data.kpis.avgLeadHours.toFixed(1)} ${t("س", "h")}` : "—",
    },
    {
      key: "stock-value",
      icon: Wallet,
      label: t("قيمة المخزون", "Stock value"),
      value: ops.data ? `${nf(ops.data.kpis.totalStockValue)} ${t("ج.م", "EGP")}` : "—",
    },
  ];

  const totalAttention = attentionCards.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Gauge className="h-5 w-5 text-primary" /> {t("مركز التحكم", "Command Center")}
          {totalAttention > 0 && <Badge variant="destructive">{totalAttention}</Badge>}
        </h1>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("يحتاج تدخل", "Needs attention")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {attentionCards.map((c) => (
            <Link key={c.key} to={c.to}>
              <Card className="p-4 h-full space-y-2 hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between">
                  <c.icon className="h-4 w-4 text-muted-foreground" />
                  <Badge variant={c.count > 0 ? "destructive" : "secondary"}>
                    {loading ? "…" : nf(c.count)}
                  </Badge>
                </div>
                <div className="font-semibold text-sm">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
                {c.preview.length > 0 && (
                  <ul className="pt-1 space-y-0.5 border-t border-border/60">
                    {c.preview.map((row, i) => (
                      <li
                        key={i}
                        className="text-xs text-muted-foreground truncate pt-1 first:pt-1.5"
                      >
                        {row}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {t("نبض التشغيل", "Operational pulse")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pulse.map((p) => (
            <Card key={p.key} className="p-4 space-y-1.5">
              <p.icon className="h-4 w-4 text-muted-foreground" />
              <div className="text-lg font-bold num">{loading ? "…" : p.value}</div>
              <div className="text-xs text-muted-foreground">{p.label}</div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
