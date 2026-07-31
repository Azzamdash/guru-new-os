import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "manager" | "data_entry" | "accountant" | "viewer" | "member" | "investor" | "order_prep" | "production_manager" | "hr" | "sales_man" | "project_manager" | "operation_manager" | "fulfillment_manager" | "branch_manager" | "team_leader" | "production_worker" | "moderator" | "customer_service";
const VALID_ROLES: Role[] = ["admin", "manager", "data_entry", "accountant", "viewer", "member", "investor", "order_prep", "production_manager", "hr", "sales_man", "project_manager", "operation_manager", "fulfillment_manager", "branch_manager", "team_leader", "production_worker", "moderator", "customer_service"];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin only");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;

    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rErr) throw rErr;

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as string);
      rolesByUser.set(r.user_id, list);
    }

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      banned_until: (u as any).banned_until ?? null,
      roles: rolesByUser.get(u.id) ?? [],
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; password: string; role: Role }) => {
    if (!VALID_ROLES.includes(d.role)) throw new Error("Invalid role");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw error;
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user!.id, role: data.role });
    if (rErr) throw rErr;
    return { id: created.user!.id };
  });

export const updateUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; password: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.password.length < 6) throw new Error("Password must be at least 6 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw error;
    return { ok: true };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; banned: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Cannot modify your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw error;
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: Role }) => {
    if (!VALID_ROLES.includes(d.role)) throw new Error("Invalid role");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: dErr } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (dErr) throw dErr;
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    if (error) throw error;
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("Cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rolesRes = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRes.data ?? []).map((r: any) => r.role as string);
    const isAdmin = roles.includes("admin");
    return {
      roles,
      isAdmin,
      isManager: isAdmin || roles.includes("manager"),
      isInvestor: roles.includes("investor"),
      isOrderPrep: roles.includes("order_prep"),
      isProductionManager: roles.includes("production_manager"),
      isHR: roles.includes("hr"),
      isSalesMan: roles.includes("sales_man"),
      isProjectManager: roles.includes("project_manager"),
      canWrite: isAdmin || roles.some((r) => ["manager","data_entry","accountant"].includes(r)),
      canViewDashboard: true,
    };
  });

export const getUserWriteAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("user_settings").select("can_write").eq("user_id", data.userId).maybeSingle();
    return { canWrite: !!row?.can_write };
  });

export const setUserWriteAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; canWrite: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_settings")
      .upsert({ user_id: data.userId, can_write: data.canWrite }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });

/** List users with the order_prep role (for assignment dropdowns). Admin/manager only. */
export const listOrderPrepUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [adminR, mgrR] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    ]);
    if (!adminR.data && !mgrR.data) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "order_prep");
    if (error) throw error;
    const ids = (roleRows ?? []).map((r) => r.user_id);
    if (!ids.length) return [];
    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    return (users?.users ?? []).filter((u) => ids.includes(u.id)).map((u) => ({ id: u.id, email: u.email ?? "" }));
  });
