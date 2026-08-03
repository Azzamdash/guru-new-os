import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSuppliers, listInvoices, listPayments, listBrands } from "@/lib/internal.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileWarning, Wallet, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  PieChart, Pie, Legend,
} from "recharts";

const COLORS = ["hsl(175 60% 55%)", "hsl(85 65% 60%)", "hsl(155 55% 55%)", "hsl(305 55% 65%)", "hsl(30 70% 60%)", "hsl(200 60% 60%)"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function SupplierDebtAnalytics({
  brandFilter,
  supplierIds,
  asOfDate,
  compact = false,
}: {
  brandFilter?: string | null;
  supplierIds?: string[];
  asOfDate?: string;
  compact?: boolean;
}) {
  const supsQ = useQuery({ queryKey: ["suppliers"], queryFn: useServerFn(listSuppliers) });
  const invsQ = useQuery({ queryKey: ["invoices"], queryFn: useServerFn(listInvoices) });
  const paysQ = useQuery({ queryKey: ["payments"], queryFn: useServerFn(listPayments) });
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: useServerFn(listBrands) });

  const refDate = asOfDate || getTodayInBusinessTimezone();
  const paidByInv = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paysQ.data ?? []) {
      if (p.paid_at && p.paid_at > refDate) continue;
      if (p.invoice_id) m.set(p.invoice_id, (m.get(p.invoice_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [paysQ.data, refDate]);
  const paidBySupStandalone = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of paysQ.data ?? []) {
      if (p.paid_at && p.paid_at > refDate) continue;
      if (!p.invoice_id && p.supplier_id) m.set(p.supplier_id, (m.get(p.supplier_id) ?? 0) + Number(p.amount));
    }
    return m;
  }, [paysQ.data, refDate]);

  const analytics = useMemo(() => {
    const supIdSet = supplierIds ? new Set(supplierIds) : null;
    const invs = (invsQ.data ?? []).filter((i) => {

      if (i.issued_at > refDate) return false;
      if (brandFilter && brandFilter !== "all" && i.brand_id !== brandFilter) return false;
      if (supIdSet && !supIdSet.has(i.supplier_id)) return false;
      return true;
    });
    let totalOutstanding = 0, totalOverdue = 0, invoiceCount = 0, overdueCount = 0, totalPaid = 0, totalBilled = 0;
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
    const bySupplier = new Map<string, { name: string; outstanding: number; overdue: number; count: number }>();
    const byBrand = new Map<string, { name: string; outstanding: number }>();

    const supMap = new Map((supsQ.data ?? []).map((s) => [s.id, s.name] as const));
    const supBrandMap = new Map((supsQ.data ?? []).map((s) => [s.id, (s as { brand_id?: string | null }).brand_id ?? null] as const));
    const brandMap = new Map((brandsQ.data ?? []).map((b) => [b.id, b.name] as const));

    for (const inv of invs) {
      const paid = paidByInv.get(inv.id) ?? 0;
      const remaining = Math.max(0, Number(inv.amount) - paid);
      totalBilled += Number(inv.amount);
      totalPaid += paid;
      totalOutstanding += remaining;
      invoiceCount += 1;

      const overdue = !!inv.due_at && inv.due_at < refDate && inv.status !== "paid" && remaining > 0;
      if (overdue) { totalOverdue += remaining; overdueCount += 1; }

      if (remaining > 0) {
        const ref = inv.due_at ?? inv.issued_at;
        const daysLate = Math.max(0, Math.floor((new Date(refDate).getTime() - new Date(ref).getTime()) / 86400000));
        if (daysLate <= 0) buckets.current += remaining;
        else if (daysLate <= 30) buckets.d30 += remaining;
        else if (daysLate <= 60) buckets.d60 += remaining;
        else if (daysLate <= 90) buckets.d90 += remaining;
        else buckets.d90plus += remaining;
      }

      const sname = supMap.get(inv.supplier_id) ?? "—";
      const supCur = bySupplier.get(inv.supplier_id) ?? { name: sname, outstanding: 0, overdue: 0, count: 0 };
      supCur.outstanding += remaining;
      supCur.overdue += overdue ? remaining : 0;
      supCur.count += 1;
      bySupplier.set(inv.supplier_id, supCur);

      if (inv.brand_id) {
        const bname = brandMap.get(inv.brand_id) ?? "—";
        const bCur = byBrand.get(inv.brand_id) ?? { name: bname, outstanding: 0 };
        bCur.outstanding += remaining;
        byBrand.set(inv.brand_id, bCur);
      }
    }

    for (const [supId, paidAmt] of paidBySupStandalone) {
      if (supIdSet && !supIdSet.has(supId)) continue;
      const supBrand = supBrandMap.get(supId);
      if (brandFilter && brandFilter !== "all" && supBrand && supBrand !== brandFilter) continue;
      totalOutstanding -= paidAmt;
      totalPaid += paidAmt;
      const sname = supMap.get(supId) ?? "—";
      const supCur = bySupplier.get(supId) ?? { name: sname, outstanding: 0, overdue: 0, count: 0 };
      supCur.outstanding -= paidAmt;
      bySupplier.set(supId, supCur);
      if (supBrand) {
        const bname = brandMap.get(supBrand) ?? "—";
        const bCur = byBrand.get(supBrand) ?? { name: bname, outstanding: 0 };
        bCur.outstanding -= paidAmt;
        byBrand.set(supBrand, bCur);
      }
    }

    // Add opening balances for filtered suppliers
    for (const s of supsQ.data ?? []) {
      if (supIdSet && !supIdSet.has(s.id)) continue;
      const supBrand = (s as { brand_id?: string | null }).brand_id ?? null;
      if (brandFilter && brandFilter !== "all" && supBrand && supBrand !== brandFilter) continue;
      const opening = Number((s as { opening_balance?: number }).opening_balance ?? 0);
      if (opening !== 0) {
        totalOutstanding += opening;
        const sname = s.name;
        const supCur = bySupplier.get(s.id) ?? { name: sname, outstanding: 0, overdue: 0, count: 0 };
        supCur.outstanding += opening;
        bySupplier.set(s.id, supCur);
        if (supBrand) {
          const bname = brandMap.get(supBrand) ?? "—";
          const bCur = byBrand.get(supBrand) ?? { name: bname, outstanding: 0 };
          bCur.outstanding += opening;
          byBrand.set(supBrand, bCur);
        }
      }
    }

    const topSuppliers = Array.from(bySupplier.values()).filter((s) => s.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, 6);
    const brandBreakdown = Array.from(byBrand.values()).filter((b) => b.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding);
    return { totalOutstanding, totalOverdue, invoiceCount, overdueCount, totalPaid, totalBilled, buckets, topSuppliers, brandBreakdown };
  }, [invsQ.data, paidByInv, paidBySupStandalone, brandFilter, supplierIds, supsQ.data, brandsQ.data, refDate]);


  const agingData = [
    { name: "الحالي", value: analytics.buckets.current },
    { name: "1-30 يوم", value: analytics.buckets.d30 },
    { name: "31-60 يوم", value: analytics.buckets.d60 },
    { name: "61-90 يوم", value: analytics.buckets.d90 },
    { name: "+90 يوم", value: analytics.buckets.d90plus },
  ];
  const agingColors = ["hsl(155 55% 55%)", "hsl(45 75% 60%)", "hsl(30 70% 60%)", "hsl(15 75% 55%)", "hsl(0 65% 55%)"];

  const loading = supsQ.isLoading || invsQ.isLoading || paysQ.isLoading;

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 lg:grid-cols-4"}`}>
        <StatCard icon={FileWarning} label={tr("إجمالي المديونيات")} value={fmt(analytics.totalOutstanding)} tone={analytics.totalOutstanding > 0 ? "warning" : "default"} />
        <StatCard icon={AlertTriangle} label={tr("متأخرات")} value={fmt(analytics.totalOverdue)} tone={analytics.totalOverdue > 0 ? "destructive" : "default"} sub={`${analytics.overdueCount} فاتورة متأخرة`} />
        <StatCard icon={Wallet} label={tr("إجمالي المدفوعات")} value={fmt(analytics.totalPaid)} tone="success" />
        <StatCard icon={TrendingUp} label={tr("نسبة السداد")} value={analytics.totalBilled > 0 ? `${((analytics.totalPaid / analytics.totalBilled) * 100).toFixed(1)}%` : "—"} />
      </div>

      {!compact && !loading && analytics.invoiceCount > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">{tr("تقادم المديونيات (Aging)")}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" name={tr("المستحق")} radius={[6, 6, 0, 0]}>
                  {agingData.map((_, i) => <Cell key={i} fill={agingColors[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">{tr("توزيع المديونيات على البراندات")}</h3>
            {analytics.brandBreakdown.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">{tr("لا مديونيات مرتبطة ببراند")}</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={analytics.brandBreakdown} dataKey="outstanding" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
                    {analytics.brandBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}

      <Card className="p-5">
        <h3 className="font-semibold mb-3">{tr("أعلى الموردين برصيد مستحق")}</h3>
        {analytics.topSuppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tr("لا مديونيات مسجلة.")}</p>
        ) : (
          <div className="space-y-2">
            {analytics.topSuppliers.map((s, i) => (
              <div key={s.name + i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">{s.count} ف{tr("فاتورة")}/div>
                  </div>
                  {s.overdue > 0 && <Badge variant="destructive">{tr("متأخر")} {fmt(s.overdue)}</Badge>}
                </div>
                <span className="num font-semibold">{fmt(s.outstanding)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = "default" }: {
  icon: typeof AlertTriangle; label: string; value: string; sub?: string;
  tone?: "default" | "warning" | "destructive" | "success";
}) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-500" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`num text-2xl font-bold mt-2 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
