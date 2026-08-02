import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, FolderKanban, CalendarDays, BarChart3, Briefcase } from "lucide-react";
import { listBrands } from "@/lib/internal.functions";
import { formatBusinessDate } from "@/lib/timezone";
import { z } from "zod";

const searchSchema = z.object({
  brandId: z.string().optional(),
  period: z.enum(["today", "week", "month", "year", "custom"]).optional().default("today"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_app/services-dashboard")({
  head: () => ({ meta: [
    { title: "Services Brand Dashboard — e-GURUS" },
    { name: "description", content: "Complete project dashboard for services brands: tracking, tasks, files, calendar, KPIs, and private PM notes." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  validateSearch: searchSchema,
  component: SdLayout,
});

function periodToRange(period: string, from?: string, to?: string) {
  if (period === "custom") return { from: from ?? null, to: to ?? null };
  const now = new Date();
  const iso = (d: Date) => formatBusinessDate(d);
  const start = new Date(now);
  if (period === "today") start.setDate(now.getDate());
  else if (period === "week") start.setDate(now.getDate() - 6);
  else if (period === "month") start.setDate(1);
  else if (period === "year") { start.setMonth(0); start.setDate(1); }
  return { from: iso(start), to: iso(now) };
}

export function useSdFilters() {
  const s = Route.useSearch();
  const { from, to } = periodToRange(s.period ?? "today", s.from, s.to);
  return { brandId: s.brandId ?? "", period: s.period ?? "today", from, to, rawFrom: s.from, rawTo: s.to };
}

function SdLayout() {
  const navigate = useNavigate();
  const s = Route.useSearch();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const listBrandsFn = useServerFn(listBrands);
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const brands = useMemo(() => (brandsQ.data ?? []).filter((b) => b.type === "service" && b.active), [brandsQ.data]);

  const tabs = [
    { to: "/services-dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { to: "/services-dashboard/projects", label: "Projects", icon: FolderKanban },
    { to: "/services-dashboard/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/services-dashboard/reports", label: "Reports", icon: BarChart3 },
  ];
  const isActive = (t: { to: string; exact?: boolean }) => t.exact ? path === t.to : path.startsWith(t.to);

  const update = (patch: Record<string, string | undefined>) =>
    navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });

  return (
    <div className="relative min-h-screen p-4 md:p-6 space-y-6">
      {/* ambient */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Header */}
      <div className="rounded-3xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-xl p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/40 to-emerald-500/20 backdrop-blur-md border border-primary/30 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold leading-tight" dir="ltr">Services Brand Dashboard</h1>
            <p className="text-xs text-muted-foreground">Projects, tasks, files, calendar & KPIs across service brands</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Brand</div>
            <Select value={s.brandId ?? "__all__"} onValueChange={(v) => update({ brandId: v === "__all__" ? undefined : v })}>
              <SelectTrigger className="h-9"><SelectValue placeholder="All service brands" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All service brands</SelectItem>
                {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Period</div>
            <Select value={s.period ?? "today"} onValueChange={(v) => update({ period: v })}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {s.period === "custom" && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">From</div>
                <Input type="date" className="h-9" value={s.from ?? ""} onChange={(e) => update({ from: e.target.value || undefined })} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">To</div>
                <Input type="date" className="h-9" value={s.to ?? ""} onChange={(e) => update({ to: e.target.value || undefined })} />
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-5 flex gap-2 flex-wrap">
          {tabs.map((t) => {
            const active = isActive(t);
            return (
              <Link
                key={t.to}
                to={t.to}
                search={{ brandId: s.brandId, period: s.period, from: s.from, to: s.to }}
                className={`inline-flex items-center gap-2 h-9 px-3 rounded-xl text-sm border transition ${
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow"
                    : "bg-background/40 border-border/60 hover:bg-background/70"
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export function SdCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-lg p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}