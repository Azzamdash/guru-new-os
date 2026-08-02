import { getTodayInBusinessTimezone } from "@/lib/timezone";
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

function inRange(iso: string | null | undefined, from?: string | null, to?: string | null) {
  if (!iso) return true;
  const s = iso.slice(0, 10);
  if (from && s < from) return false;
  if (to && s > to) return false;
  return true;
}

// -------------------- OVERVIEW --------------------
export const getSdOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; dateFrom?: string | null; dateTo?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let projQ = context.supabase.from("service_projects").select("*");
    if (data.brandId) projQ = projQ.eq("brand_id", data.brandId);
    const { data: projects, error: pErr } = await projQ;
    if (pErr) throw pErr;

    const projIds = (projects ?? []).map((p: { id: string }) => p.id);
    const [tasksR, revsR] = await Promise.all([
      projIds.length
        ? context.supabase.from("project_tasks").select("id,project_id,assignee_id,status,due_date").in("project_id", projIds)
        : Promise.resolve({ data: [], error: null }),
      projIds.length
        ? context.supabase.from("project_revisions").select("id,project_id,status,created_at").in("project_id", projIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const tasks = tasksR.data ?? [];
    const revs = revsR.data ?? [];

    const today = getTodayInBusinessTimezone();
    const projInRange = (projects ?? []).filter((p: { started_at: string | null; finished_at: string | null }) =>
      inRange(p.finished_at ?? p.started_at, data.dateFrom, data.dateTo),
    );

    // Status distribution
    const statusCounts: Record<string, number> = {};
    for (const p of projInRange) statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;

    // Upcoming deadlines (next 14 days, not done)
    const in14 = new Date(); in14.setDate(in14.getDate() + 14);
    const upcoming = (projects ?? [])
      .filter((p: { deadline: string | null; status: string }) => p.deadline && p.status !== "done" && p.status !== "cancelled" && p.deadline <= in14.toISOString().slice(0,10))
      .sort((a: { deadline: string | null }, b: { deadline: string | null }) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
      .slice(0, 15);

    // Overdue
    const overdue = (projects ?? []).filter((p: { deadline: string | null; status: string }) =>
      p.deadline && p.deadline < today && p.status !== "done" && p.status !== "cancelled",
    );

    // Workload: tasks per assignee (open)
    const workload: Record<string, number> = {};
    for (const t of tasks) {
      if (!t.assignee_id) continue;
      if (t.status === "done") continue;
      workload[t.assignee_id] = (workload[t.assignee_id] || 0) + 1;
    }

    // Risks
    const risks: Array<{ project_id: string; name: string; reason: string }> = [];
    for (const p of projects ?? []) {
      if (!p.deadline && p.status !== "done" && p.status !== "cancelled") risks.push({ project_id: p.id, name: p.name, reason: "Missing deadline" });
      else if (p.deadline && p.deadline < today && p.status !== "done" && p.status !== "cancelled") risks.push({ project_id: p.id, name: p.name, reason: "Overdue" });
    }

    // Revenue snapshot
    const revenue = projInRange
      .filter((p: { status: string }) => p.status === "done")
      .reduce((a: number, p: { pricing_type: string; cost: number; commission: number }) =>
        a + Number(p.pricing_type === "commission" ? p.commission : p.cost), 0);

    return {
      totals: {
        projects: projInRange.length,
        done: statusCounts.done ?? 0,
        in_progress: statusCounts.in_progress ?? 0,
        pending: statusCounts.pending ?? 0,
        cancelled: statusCounts.cancelled ?? 0,
        overdue: overdue.length,
        openRevisions: revs.filter((r: { status: string }) => r.status === "open").length,
        revenue,
      },
      statusCounts,
      upcoming,
      overdue,
      workload,
      risks: risks.slice(0, 20),
    };
  });

// -------------------- PROJECTS --------------------
export const listSdProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; dateFrom?: string | null; dateTo?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("service_projects").select("*, service_clients(name)").order("deadline", { ascending: true, nullsFirst: false });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).filter((p: { started_at: string | null; finished_at: string | null }) => inRange(p.finished_at ?? p.started_at, data.dateFrom, data.dateTo));
  });

export const getSdProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("service_projects").select("*, service_clients(name)").eq("id", data.id).maybeSingle();
    if (error) throw error;
    return row;
  });

export const upsertSdProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .inputValidator((d: Record<string, any>) => d)
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context, ["admin", "manager", "data_entry", "accountant", "project_manager"]))) throw new Error("Forbidden");
    // Strip any joined relations that PostgREST returned on read
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { service_clients, ...clean } = data as Record<string, unknown>;
    if (clean.id) {
      const { id, ...patch } = clean as { id: string } & Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await context.supabase.from("service_projects").update(patch as any).eq("id", id);
      if (error) throw error;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await context.supabase.from("service_projects").insert(clean as any);
      if (error) throw error;
    }
    return { ok: true };
  });

// -------------------- TASKS --------------------
export const listProjectTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_tasks").select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertProjectTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .inputValidator((d: Record<string, any>) => d)
  .handler(async ({ data, context }) => {
    const payload = { ...data, created_by: data.id ? data.created_by : context.userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("project_tasks").upsert(payload as any);
    if (error) throw error;
    return { ok: true };
  });

export const deleteProjectTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------------------- FILES --------------------
export const listProjectFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_files").select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const attachProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string; name: string; url: string; source?: string; mime?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const source = data.source ?? (data.url.includes("drive.google.com") || data.url.includes("docs.google.com") ? "drive" : "link");
    const { error } = await context.supabase.from("project_files").insert({
      project_id: data.project_id, name: data.name, url: data.url, source, mime: data.mime ?? null, uploaded_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_files").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------------------- COMMENTS --------------------
export const listProjectComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_comments").select("*").eq("project_id", data.projectId).order("created_at", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const addProjectComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string; body: string; parent_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_comments").insert({
      project_id: data.project_id, body: data.body, parent_id: data.parent_id ?? null, author_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

// -------------------- REVISIONS --------------------
export const listProjectRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_revisions").select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const upsertProjectRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .inputValidator((d: Record<string, any>) => d)
  .handler(async ({ data, context }) => {
    const payload = { ...data, requested_by: data.id ? data.requested_by : context.userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("project_revisions").upsert(payload as any);
    if (error) throw error;
    return { ok: true };
  });

// -------------------- PRIVATE NOTES --------------------
export const listPrivateNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_private_notes").select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) return [];
    return rows ?? [];
  });

export const addPrivateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string; body: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_private_notes").insert({
      project_id: data.project_id, body: data.body, author_id: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deletePrivateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_private_notes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------------------- CALENDAR EVENTS --------------------
export const listSdEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; from?: string | null; to?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("project_events").select("*, service_projects(name)").order("starts_at", { ascending: true });
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lte("starts_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const upsertSdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .inputValidator((d: Record<string, any>) => d)
  .handler(async ({ data, context }) => {
    const payload = { ...data, created_by: data.id ? data.created_by : context.userId };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("project_events").upsert(payload as any);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_events").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// -------------------- REPORTS --------------------
export const getSdReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { brandId?: string | null; dateFrom?: string | null; dateTo?: string | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("service_projects").select("*");
    if (data.brandId) q = q.eq("brand_id", data.brandId);
    const { data: projects, error } = await q;
    if (error) throw error;
    const inR = (projects ?? []).filter((p: { started_at: string | null; finished_at: string | null }) =>
      inRange(p.finished_at ?? p.started_at, data.dateFrom, data.dateTo),
    );
    const done = inR.filter((p: { status: string }) => p.status === "done");
    const onTime = done.filter((p: { deadline: string | null; finished_at: string | null }) =>
      !p.deadline || (p.finished_at && p.finished_at.slice(0,10) <= p.deadline),
    );

    // Revision rate
    const projIds = inR.map((p: { id: string }) => p.id);
    const revsR = projIds.length
      ? await context.supabase.from("project_revisions").select("project_id,status").in("project_id", projIds)
      : { data: [] };
    const revs = revsR.data ?? [];

    // Avg completion days
    let avgDays = 0;
    if (done.length) {
      const total = done.reduce((a: number, p: { started_at: string | null; finished_at: string | null }) => {
        if (!p.started_at || !p.finished_at) return a;
        const d = (new Date(p.finished_at).getTime() - new Date(p.started_at).getTime()) / (86400 * 1000);
        return a + d;
      }, 0);
      avgDays = Math.round(total / Math.max(1, done.filter((p: { started_at: string | null; finished_at: string | null }) => p.started_at && p.finished_at).length));
    }

    // Revenue per PM
    const perPm: Record<string, number> = {};
    for (const p of done) {
      const pm = p.pm_user_id ?? "unassigned";
      perPm[pm] = (perPm[pm] || 0) + Number(p.pricing_type === "commission" ? p.commission : p.cost);
    }

    // Revenue per client
    const perClient: Record<string, number> = {};
    for (const p of done) {
      const c = p.client_id ?? "unknown";
      perClient[c] = (perClient[c] || 0) + Number(p.pricing_type === "commission" ? p.commission : p.cost);
    }

    return {
      totals: inR.length,
      completed: done.length,
      onTimePct: done.length ? Math.round((onTime.length / done.length) * 100) : 0,
      avgDays,
      revisionRate: inR.length ? Math.round((revs.length / inR.length) * 100) : 0,
      revenue: done.reduce((a: number, p: { pricing_type: string; cost: number; commission: number }) =>
        a + Number(p.pricing_type === "commission" ? p.commission : p.cost), 0),
      perPm,
      perClient,
    };
  });

// -------------------- NOTIFICATIONS --------------------
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("notifications").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    return rows ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string; all?: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (data.all) {
      const { error } = await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", context.userId).is("read_at", null);
      if (error) throw error;
    } else if (data.id) {
      const { error } = await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id);
      if (error) throw error;
    }
    return { ok: true };
  });
// -------------------- C2: Invoice from Project --------------------
export const createInvoiceFromProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; totalAmount: number }) => d)
  .handler(async ({ data, context }) => {
    if (!(await hasAnyRole(context, ["admin", "manager", "data_entry", "accountant", "project_manager"])))
      throw new Error("Forbidden");
    const { data: project, error: pErr } = await context.supabase
      .from("service_projects")
      .select("*, service_clients(name)")
      .eq("id", data.projectId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!project) throw new Error("Project not found");

    const { data: inv, error: iErr } = await context.supabase
      .from("sales_invoices")
      .insert({
        brand_id: project.brand_id,
        type: "sale",
        qty: 1,
        total_amount: data.totalAmount,
        occurred_at: getTodayInBusinessTimezone(),
        customer_name: project.service_clients?.name ?? null,
        note: `Project: ${project.name}`,
      })
      .select("id")
      .single();
    if (iErr) throw iErr;

    const { error: uErr } = await context.supabase
      .from("service_projects")
      .update({ invoice_id: inv.id })
      .eq("id", data.projectId);
    if (uErr) throw uErr;

    return { invoiceId: inv.id };
  });
