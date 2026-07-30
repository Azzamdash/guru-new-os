import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function isManager(context: Ctx) {
  const results = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
  ]);
  return results.some((r) => !r.error && r.data === true);
}

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Array<{
      id: string;
      title: string;
      description: string | null;
      status: "todo" | "in_progress" | "done";
      priority: "low" | "medium" | "high";
      due_date: string | null;
      assignee_id: string | null;
      created_by: string | null;
      brand_id: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>;
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    title: string;
    description?: string | null;
    status?: "todo" | "in_progress" | "done";
    priority?: "low" | "medium" | "high";
    due_date?: string | null;
    assignee_id?: string | null;
    brand_id?: string | null;
    notes?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const manager = await isManager(context);
    if (!manager && !data.id) throw new Error("Forbidden: managers only");
    // Non-managers can only update status of tasks assigned to them (RLS enforces)
    const base = {
      title: data.title,
      description: data.description ?? null,
      status: data.status ?? "todo",
      priority: data.priority ?? "medium",
      due_date: data.due_date ?? null,
      assignee_id: data.assignee_id ?? null,
      brand_id: data.brand_id ?? null,
      notes: data.notes ?? null,
    };
    const payload = data.id
      ? { id: data.id, ...base }
      : { ...base, created_by: context.userId };

    const { data: saved, error } = await context.supabase
      .from("tasks")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any)
      .select("id")
      .single();
    if (error) throw error;
    return { id: saved.id };
  });

export const updateTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "todo" | "in_progress" | "done" }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isManager(context))) throw new Error("Forbidden: managers only");
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
