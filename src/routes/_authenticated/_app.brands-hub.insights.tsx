import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBhInsights } from "@/lib/brandhub.functions";
import { listBhReports, resolveBhReport } from "@/lib/brandhub-creative.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/_authenticated/_app/brands-hub/insights")({
  head: () => ({
    meta: [
      { title: "Insights — Brands Hub — e-GURUS" },
      { name: "description", content: "إحصائيات البراندات: المحتوى، المهام، المنشورات والبلاغات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BhInsights,
});

function BhInsights() {
  const qc = useQueryClient();
  const insightsFn = useServerFn(getBhInsights);
  const reportsFn = useServerFn(listBhReports);
  const resolveFn = useServerFn(resolveBhReport);
  const q = useQuery({ queryKey: ["bh-insights"], queryFn: () => insightsFn() });
  const rq = useQuery({ queryKey: ["bh-reports"], queryFn: () => reportsFn() });

  const kpis = [
    { label: "البراندات", value: q.data?.brands ?? 0 },
    { label: "الملفات والموارد", value: q.data?.resources ?? 0 },
    { label: "مقالات الويكي", value: q.data?.wiki ?? 0 },
    { label: "المهام", value: q.data?.tasks ?? 0 },
    { label: "مهام مكتملة", value: q.data?.tasksDone ?? 0 },
    { label: "منشورات Creative", value: q.data?.posts ?? 0 },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/brands-hub">
          <ArrowLeft className="w-4 h-4 me-1" /> Brands Hub
        </Link>
      </Button>
      <h1 className="text-2xl md:text-3xl font-extrabold">Insights</h1>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-2xl font-extrabold">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="font-bold mb-3">لكل براند</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>البراند</TableHead>
              <TableHead>الموارد</TableHead>
              <TableHead>الويكي</TableHead>
              <TableHead>المهام</TableHead>
              <TableHead>المنشورات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.perBrand ?? []).map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Link to="/brands-hub/$slug" params={{ slug: b.slug }} className="hover:underline">
                    {b.name}
                  </Link>
                </TableCell>
                <TableCell>{b.resources}</TableCell>
                <TableCell>{b.wiki}</TableCell>
                <TableCell>{b.tasks}</TableCell>
                <TableCell>{b.posts}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="font-bold">البلاغات</div>
        {(rq.data ?? []).length === 0 ? (
          <EmptyState title="لا توجد بلاغات" />
        ) : (
          (rq.data ?? []).map((r: { id: string; reason: string; status: string; created_at: string }) => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 pb-2">
              <div>
                <div>{r.reason}</div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} · {r.status}
                </div>
              </div>
              {r.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await resolveFn({ data: { id: r.id, status: "resolved" } });
                    qc.invalidateQueries({ queryKey: ["bh-reports"] });
                  }}
                >
                  إغلاق
                </Button>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
