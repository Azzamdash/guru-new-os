import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

export type BhTask = {
  id: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  cadence: "once" | "daily" | "weekly" | "monthly";
  due_date: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  brand_id: string | null;
  created_by: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

async function isManager(context: Ctx) {
  const { data } = await context.supabase.rpc("bh_is_manager", { _user_id: context.userId });
  return data === true;
}

export const listBhTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [tasksRes, usersRes] = await Promise.all([
      context.supabase
        .from("bh_tasks")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false }),
      (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
        return data?.users ?? [];
      })(),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    return {
      tasks: (tasksRes.data ?? []) as BhTask[],
      users: usersRes.map((u) => ({ id: u.id, email: u.email ?? "" })),
      isManager: await isManager(context),
      me: context.userId,
    };
  });

export const upsertBhTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      title: string;
      description?: string;
      status?: BhTask["status"];
      priority?: BhTask["priority"];
      cadence?: BhTask["cadence"];
      due_date?: string | null;
      assignee_id?: string | null;
      brand_id?: string | null;
      position?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const base = {
      title: data.title.trim(),
      description: data.description ?? "",
      status: data.status ?? "todo",
      priority: data.priority ?? "medium",
      cadence: data.cadence ?? "once",
      due_date: data.due_date || null,
      assignee_id: data.assignee_id || null,
      brand_id: data.brand_id || null,
      position: data.position ?? 0,
      completed_at: data.status === "done" ? new Date().toISOString() : null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("bh_tasks").update(base).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("bh_tasks")
      .insert({ ...base, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id as string };
  });

export const setBhTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: BhTask["status"] }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bh_tasks")
      .update({
        status: data.status,
        completed_at: data.status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteBhTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listBhTaskDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string }) => d)
  .handler(async ({ data, context }) => {
    const [comments, attachments] = await Promise.all([
      context.supabase
        .from("bh_task_comments")
        .select("*")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("bh_task_attachments")
        .select("*")
        .eq("task_id", data.taskId)
        .order("created_at", { ascending: true }),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const atts = (attachments.data ?? []) as any[];
    await Promise.all(
      atts.map(async (a) => {
        if (!a.storage_path) return;
        const { data: s } = await context.supabase.storage
          .from("bh-brand-files")
          .createSignedUrl(a.storage_path, 3600);
        a.signed_url = s?.signedUrl ?? null;
      }),
    );
    return { comments: comments.data ?? [], attachments: atts };
  });

export const addBhTaskComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; body: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("bh_task_comments")
      .insert({ task_id: data.taskId, body: data.body.trim(), author_id: context.userId });
    if (error) throw error;
    return { ok: true };
  });

export const addBhTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { taskId: string; title: string; storage_path?: string | null; url?: string | null; mime_type?: string | null }) => d,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_task_attachments").insert({
      task_id: data.taskId,
      title: data.title,
      storage_path: data.storage_path ?? null,
      url: data.url ?? null,
      mime_type: data.mime_type ?? null,
      created_by: context.userId,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deleteBhTaskAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bh_task_attachments").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
