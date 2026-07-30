import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuditFilter = {
  from?: string | null;
  to?: string | null;
  tableName?: string | null;
  operation?: "INSERT" | "UPDATE" | "DELETE" | null;
  actorId?: string | null;
  limit?: number;
  offset?: number;
};

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AuditFilter) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const rs = (roles ?? []).map((r) => r.role as string);
    if (!rs.includes("admin") && !rs.includes("manager")) throw new Error("Forbidden");

    const limit = Math.min(Math.max(data.limit ?? 100, 1), 500);
    const offset = Math.max(data.offset ?? 0, 0);
    let q = supabase
      .from("financial_audit_log")
      .select("id, table_name, record_id, operation, actor_id, old_data, new_data, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.tableName) q = q.eq("table_name", data.tableName);
    if (data.operation) q = q.eq("operation", data.operation);
    if (data.actorId) q = q.eq("actor_id", data.actorId);

    const { data: rows, count, error } = await q;
    if (error) throw error;

    const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id).filter(Boolean))) as string[];
    const actorMap = new Map<string, string>();
    if (actorIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: users } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of users?.users ?? []) {
        if (actorIds.includes(u.id)) actorMap.set(u.id, u.email ?? u.id);
      }
    }

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        actor_email: r.actor_id ? (actorMap.get(r.actor_id) ?? r.actor_id) : "—",
      })),
      total: count ?? 0,
      limit,
      offset,
    };
  });