import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function hasAnyRole(context: Ctx, roles: string[]) {
  const results = await Promise.all(
    roles.map((r) => context.supabase.rpc("has_role", { _user_id: context.userId, _role: r })),
  );
  return results.some((r) => !r.error && r.data === true);
}
async function assertWriter(context: Ctx) {
  if (!(await hasAnyRole(context, ["admin", "manager", "data_entry", "accountant", "project_manager"]))) throw new Error("Forbidden");
}

export type ServiceClient = {
  id: string; brand_id: string; name: string; contact: string | null;
  status: "active" | "inactive"; notes: string | null;
};
export type ServiceProject = {
  id: string; brand_id: string; client_id: string; name: string;
  status: "pending" | "in_progress" | "done" | "cancelled";
  pricing_type: "fixed" | "commission";
  cost: number; commission: number;
  started_at: string | null; finished_at: string | null; note: string | null;
};

export const listServiceClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("service_clients").select("*").order("created_at", { ascending: false });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as ServiceClient[];
  });

export const upsertServiceClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<ServiceClient> & { brand_id: string; name: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("service_clients").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteServiceClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("service_clients").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listServiceProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; clientId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("service_projects").select("*").order("created_at", { ascending: false });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as ServiceProject[];
  });

export const upsertServiceProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Partial<ServiceProject> & { brand_id: string; client_id: string; name: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("service_projects").upsert(data);
    if (error) throw error;
    return { ok: true };
  });

export const deleteServiceProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("service_projects").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Aggregated KPIs for a service brand
export const getServiceBrandOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId: string; dateFrom?: string | null; dateTo?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const [clientsR, projectsR, expensesR, monthlyR] = await Promise.all([
      context.supabase.from("service_clients").select("id,status").eq("brand_id", data.brandId),
      context.supabase.from("service_projects").select("id,client_id,status,pricing_type,cost,commission,started_at,finished_at").eq("brand_id", data.brandId),
      context.supabase.from("expense_entries").select("amount, note, platform, attributed_revenue, category_id, period_date, expense_categories(name, slug)").eq("brand_id", data.brandId),
      context.supabase.from("monthly_entries").select("revenue, period_date, period_end_date, year, month").eq("brand_id", data.brandId),
    ]);
    const clients = (clientsR.data ?? []) as Array<{ id: string; status: string }>;
    const projects = (projectsR.data ?? []) as Array<{ id: string; client_id: string; status: string; pricing_type: string; cost: number; commission: number; started_at: string | null; finished_at: string | null }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const expenses = (expensesR.data ?? []) as Array<any>;
    const monthly = (monthlyR.data ?? []) as Array<{ revenue: number }>;

    const withinDate = (d: string | null) => {
      if (!d) return true;
      if (data.dateFrom && d < data.dateFrom) return false;
      if (data.dateTo && d > data.dateTo) return false;
      return true;
    };

    const projectsF = projects.filter((p) => withinDate(p.finished_at ?? p.started_at));
    const doneProjects = projectsF.filter((p) => p.status === "done");
    const projectsRevenue = doneProjects.reduce((a, p) => a + Number(p.pricing_type === "commission" ? p.commission : p.cost), 0);
    const monthlyRevenue = monthly.reduce((a, m) => a + Number(m.revenue || 0), 0);

    const expensesF = expenses.filter((e) => withinDate(e.period_date));
    const totalExpenses = expensesF.reduce((a, e) => a + Number(e.amount || 0), 0);
    const marketing = expensesF.filter((e) => e.expense_categories?.slug === "marketing").reduce((a, e) => a + Number(e.amount || 0), 0);
    const salaries = expensesF.filter((e) => e.expense_categories?.slug === "salaries").reduce((a, e) => a + Number(e.amount || 0), 0);

    const activeClients = clients.filter((c) => c.status === "active").length;
    const inactiveClients = clients.filter((c) => c.status === "inactive").length;

    // per-client project stats
    const perClient: Record<string, { total: number; done: number; in_progress: number; pending: number; cancelled: number; value: number }> = {};
    for (const p of projects) {
      const s = perClient[p.client_id] ?? (perClient[p.client_id] = { total: 0, done: 0, in_progress: 0, pending: 0, cancelled: 0, value: 0 });
      s.total += 1;
      s[p.status as keyof typeof s] = (s[p.status as keyof typeof s] as number) + 1;
      s.value += Number(p.pricing_type === "commission" ? p.commission : p.cost);
    }

    const totalRevenue = projectsRevenue + monthlyRevenue;
    return {
      kpis: {
        totalRevenue,
        projectsRevenue,
        otherRevenue: monthlyRevenue,
        totalExpenses,
        marketing,
        salaries,
        profit: totalRevenue - totalExpenses,
        activeClients,
        inactiveClients,
        totalClients: clients.length,
        totalProjects: projects.length,
        doneProjects: doneProjects.length,
      },
      perClient,
    };
  });
