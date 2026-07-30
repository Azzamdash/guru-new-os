import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SdCard, periodToRange } from "@/components/sd/SdCard";
import { getSdOverview } from "@/lib/servicesDashboard.functions";
import { AlertTriangle, Calendar, CheckCircle2, Clock, DollarSign, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/_app/services-dashboard/")({
  component: OverviewPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

function OverviewPage() {
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });
  const { from, to } = periodToRange(s.period ?? "month", s.from, s.to);
  const overviewFn = useServerFn(getSdOverview);
  const q = useQuery({
    queryKey: ["sd-overview", s.brandId, from, to],
    queryFn: () => overviewFn({ data: { brandId: s.brandId ?? null, dateFrom: from, dateTo: to } }),
  });

  const d = q.data;

  return (
    <div className="grid gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Projects" value={d?.totals.projects ?? 0} tone="primary" />
        <Kpi icon={CheckCircle2} label="Completed" value={d?.totals.done ?? 0} tone="emerald" />
        <Kpi icon={AlertTriangle} label="Overdue" value={d?.totals.overdue ?? 0} tone="rose" />
        <Kpi icon={DollarSign} label="Revenue" value={fmt(d?.totals.revenue ?? 0)} tone="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SdCard>
          <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4" /><h3 className="font-bold">Upcoming Deadlines</h3></div>
          {d?.upcoming.length === 0 && <div className="text-sm text-muted-foreground">No deadlines in the next 14 days.</div>}
          <div className="space-y-2">
            {d?.upcoming.map((p) => (
              <Link key={p.id} to="/services-dashboard/projects/$id" params={{ id: p.id }}
                    search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/60">
                <span className="text-sm truncate">{p.name}</span>
                <Badge variant="outline">{p.deadline}</Badge>
              </Link>
            ))}
          </div>
        </SdCard>

        <SdCard>
          <div className="flex items-center gap-2 mb-3"><Clock className="w-4 h-4" /><h3 className="font-bold">Workload (open tasks / assignee)</h3></div>
          {d && Object.keys(d.workload).length === 0 && <div className="text-sm text-muted-foreground">No open tasks assigned.</div>}
          <div className="space-y-2">
            {d && Object.entries(d.workload).sort((a,b) => b[1]-a[1]).slice(0,10).map(([uid, cnt]) => (
              <div key={uid} className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
                <span className="text-xs font-mono truncate max-w-[60%]">{uid.slice(0,8)}…</span>
                <Badge>{cnt} tasks</Badge>
              </div>
            ))}
          </div>
        </SdCard>
      </div>

      <SdCard>
        <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-rose-500" /><h3 className="font-bold">Risk Flags</h3></div>
        {d?.risks.length === 0 && <div className="text-sm text-muted-foreground">No risks detected 🎉</div>}
        <div className="grid md:grid-cols-2 gap-2">
          {d?.risks.map((r) => (
            <Link key={r.project_id} to="/services-dashboard/projects/$id" params={{ id: r.project_id }}
                  search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}
                  className="flex items-center justify-between p-2 rounded-lg border border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10">
              <span className="text-sm truncate">{r.name}</span>
              <Badge variant="destructive">{r.reason}</Badge>
            </Link>
          ))}
        </div>
      </SdCard>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number | string; tone: string }) {
  const toneMap: Record<string, string> = {
    primary: "from-primary/40 to-primary/10 text-primary",
    emerald: "from-emerald-500/40 to-emerald-500/10 text-emerald-500",
    rose: "from-rose-500/40 to-rose-500/10 text-rose-500",
    amber: "from-amber-500/40 to-amber-500/10 text-amber-500",
  };
  return (
    <SdCard className="!p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-extrabold mt-1">{value}</div>
        </div>
        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${toneMap[tone]} border border-border/50 flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </SdCard>
  );
}