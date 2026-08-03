import { tr } from "@/lib/i18n";
import { formatBusinessDate } from "@/lib/timezone";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Store, TrendingUp, Wallet, Boxes, Trophy } from "lucide-react";
import { getBranchesReport } from "@/lib/pos.functions";

export const Route = createFileRoute("/_authenticated/_app/reports/branches")({
  head: () => ({ meta: [{ title: "تقارير الفروع الأوفلاين — e-GURUS" }, { name: "description", content: "أداء الفروع الأوفلاين وأعلى البائعين" }] }),
  component: BranchesReportPage,
});

function BranchesReportPage() {
  const today = getTodayInBusinessTimezone();
  const thirtyAgo = formatBusinessDate(new Date(Date.now() - 30 * 86400000));
  const [start, setStart] = useState(thirtyAgo);
  const [end, setEnd] = useState(today);
  const fn = useServerFn(getBranchesReport);
  const q = useQuery({
    queryKey: ["branches-report", start, end],
    queryFn: () => fn({ data: { startDate: start, endDate: end } }),
  });
  const data = q.data;
  const totalRev = (data?.branches ?? []).reduce((s, b) => s + b.revenue, 0);
  const totalExp = (data?.branches ?? []).reduce((s, b) => s + b.expenses, 0);
  const totalStock = (data?.branches ?? []).reduce((s, b) => s + b.stockValue, 0);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Store className="w-7 h-7" /> ت{tr("تقارير الفروع الأوفلاين")}/h1>
          <p className="text-muted-foreground text-sm mt-1">{tr("إيرادات ومصروفات ومخزون كل فرع + أعلى البائعين.")}</p>
        </div>
        <div className="flex items-end gap-2">
          <div><Label className="text-xs">{tr("من")}</Label><Input type="date" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label className="text-xs">{tr("إلى")}</Label><Input type="date" dir="ltr" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<TrendingUp className="w-5 h-5" />} label={tr("إجمالي الإيرادات")} value={totalRev} />
        <Kpi icon={<Wallet className="w-5 h-5" />} label={tr("إجمالي المصروفات")} value={totalExp} />
        <Kpi icon={<TrendingUp className="w-5 h-5" />} label={tr("صافي (تقريبي)")} value={totalRev - totalExp} />
        <Kpi icon={<Boxes className="w-5 h-5" />} label={tr("قيمة المخزون الحالي")} value={totalStock} />
      </div>

      <Card className="card-gradient overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{tr("الفرع")}</th>
              <th className="p-3">{tr("فواتير")}</th>
              <th className="p-3">{tr("قطع مباعة")}</th>
              <th className="p-3">{tr("إيرادات")}</th>
              <th className="p-3">{tr("كاش")}</th>
              <th className="p-3">{tr("فيزا")}</th>
              <th className="p-3">{tr("مصروفات")}</th>
              <th className="p-3">{tr("قطع بالمخزون")}</th>
              <th className="p-3">{tr("قيمة المخزون")}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.branches ?? []).map((b) => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="p-3 font-medium">{b.name}</td>
                <td className="p-3 num">{b.orders}</td>
                <td className="p-3 num">{(b as unknown as { pieces: number }).pieces?.toLocaleString("en-US") ?? 0}</td>
                <td className="p-3 num text-primary font-bold">{b.revenue.toLocaleString("en-US")}</td>
                <td className="p-3 num">{b.cash.toLocaleString("en-US")}</td>
                <td className="p-3 num">{b.card.toLocaleString("en-US")}</td>
                <td className="p-3 num">{b.expenses.toLocaleString("en-US")}</td>
                <td className="p-3 num">{b.stockUnits.toLocaleString("en-US")}</td>
                <td className="p-3 num">{b.stockValue.toLocaleString("en-US")}</td>
              </tr>
            ))}
            {(data?.branches ?? []).length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{tr("لا فروع أوفلاين بعد.")}</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <h2 className="font-bold mb-3 flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> أ{tr("أعلى البائعين")}/h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-muted-foreground text-right border-b border-border">
                <th className="p-3">{tr("الترتيب")}</th>
                <th className="p-3">{tr("البائع")}</th>
                <th className="p-3">{tr("عدد فواتير")}</th>
                <th className="p-3">{tr("إجمالي المبيعات")}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topSellers ?? []).map((s, idx) => (
                <tr key={s.userId} className="border-b border-border/50">
                  <td className="p-3"><Badge>{idx + 1}</Badge></td>
                  <td className="p-3" dir="ltr">{s.email}</td>
                  <td className="p-3 num">{s.orders}</td>
                  <td className="p-3 num text-primary font-bold">{s.revenue.toLocaleString("en-US")}</td>
                </tr>
              ))}
              {(data?.topSellers ?? []).length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{tr("لا مبيعات في هذه الفترة.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}<span>{label}</span></div>
      <div className="text-2xl font-bold num mt-1">{Number(value).toLocaleString("en-US")}</div>
    </Card>
  );
}