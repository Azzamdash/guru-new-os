import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SdCard } from "@/components/sd/SdCard";
import { periodToRange } from "@/components/sd/SdCard";
import { getSdReports } from "@/lib/servicesDashboard.functions";

export const Route = createFileRoute("/_authenticated/_app/services-dashboard/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const s = useSearch({ from: "/_authenticated/_app/services-dashboard" });
  const range = periodToRange(s.period, s.from ?? undefined, s.to ?? undefined);
  const fn = useServerFn(getSdReports);
  const q = useQuery({
    queryKey: ["sd-reports", s.brandId, s.period, s.from, s.to],
    queryFn: () => fn({ data: { brandId: s.brandId ?? null, dateFrom: range.from, dateTo: range.to } }),
  });
  const r = q.data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Projects" value={r?.totals ?? 0} />
        <Kpi label="Completed" value={r?.completed ?? 0} />
        <Kpi label="On-time %" value={`${r?.onTimePct ?? 0}%`} tone="success" />
        <Kpi label="Avg days" value={r?.avgDays ?? 0} />
        <Kpi label="Revision rate" value={`${r?.revisionRate ?? 0}%`} tone="warning" />
        <Kpi label="Revenue" value={Number(r?.revenue ?? 0).toLocaleString("en-US")} tone="brand" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <SdCard>
          <h3 className="font-bold mb-3">Revenue by Project Manager</h3>
          <div className="space-y-2">
            {Object.entries(r?.perPm ?? {}).sort((a, b) => Number(b[1]) - Number(a[1])).map(([pm, v]) => (
              <div key={pm} className="flex justify-between text-sm p-2 rounded-lg bg-muted/40">
                <span>{pm === "unassigned" ? "Unassigned" : pm.slice(0, 8)}</span>
                <span className="font-mono">{Number(v).toLocaleString("en-US")}</span>
              </div>
            ))}
            {Object.keys(r?.perPm ?? {}).length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
          </div>
        </SdCard>
        <SdCard>
          <h3 className="font-bold mb-3">Revenue by Client</h3>
          <div className="space-y-2">
            {Object.entries(r?.perClient ?? {}).sort((a, b) => Number(b[1]) - Number(a[1])).map(([c, v]) => (
              <div key={c} className="flex justify-between text-sm p-2 rounded-lg bg-muted/40">
                <span>{c === "unknown" ? "Unknown" : c.slice(0, 8)}</span>
                <span className="font-mono">{Number(v).toLocaleString("en-US")}</span>
              </div>
            ))}
            {Object.keys(r?.perClient ?? {}).length === 0 && <div className="text-sm text-muted-foreground">No data.</div>}
          </div>
        </SdCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" | "brand" }) {
  const toneCls = tone === "success" ? "text-emerald-500" : tone === "warning" ? "text-amber-500" : tone === "brand" ? "text-primary" : "";
  return (
    <SdCard className="p-4">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold mt-1 ${toneCls}`}>{value}</div>
    </SdCard>
  );
}