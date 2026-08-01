/** Server-only helpers for order distribution. */

const DISTRIBUTION_ROUTE = "/order-distribution";

export type StaffMember = {
  /** auth user id — orders are assigned to app users, not HR employee records */
  id: string;
  name: string;
  email: string | null;
  brandId: string | null;
  userId: string;
};

const STAFF_ROLES = [
  "customer_service",
  "operation_manager",
  "fulfillment_manager",
  "admin",
  "manager",
] as const;

/**
 * Staff that orders can be distributed to = application users (Users &
 * Permissions) that have access to the distribution page or hold a
 * customer-service / manager-style role.
 */
export async function getEligibleStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabase?: any,
): Promise<StaffMember[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: grants }, { data: roles }, usersRes, { data: employees }] = await Promise.all([
    supabaseAdmin
      .from("user_section_access")
      .select("user_id, section")
      .in("section", [
        `page:${DISTRIBUTION_ROUTE}`,
        `write:${DISTRIBUTION_ROUTE}`,
        `deny:${DISTRIBUTION_ROUTE}`,
      ]),
    supabaseAdmin.from("user_roles").select("user_id, role").in("role", STAFF_ROLES),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    supabaseAdmin.from("employees").select("name, brand_id, user_id").not("user_id", "is", null),
  ]);

  const denied = new Set<string>();
  const allowed = new Set<string>();
  for (const g of (grants ?? []) as Array<{ user_id: string; section: string }>) {
    if (g.section === `deny:${DISTRIBUTION_ROUTE}`) denied.add(g.user_id);
    else allowed.add(g.user_id);
  }
  for (const r of (roles ?? []) as Array<{ user_id: string }>) allowed.add(r.user_id);

  const profile = new Map<string, { name: string; brandId: string | null }>(
    ((employees ?? []) as Array<{ name: string; brand_id: string | null; user_id: string }>).map((e) => [
      e.user_id,
      { name: e.name, brandId: e.brand_id },
    ]),
  );

  const users = (usersRes?.data?.users ?? []) as Array<{
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }>;

  return users
    .filter((u) => allowed.has(u.id) && !denied.has(u.id))
    .map((u) => {
      const meta = u.user_metadata ?? {};
      const metaName =
        (typeof meta["full_name"] === "string" && meta["full_name"]) ||
        (typeof meta["name"] === "string" && meta["name"]) ||
        null;
      const p = profile.get(u.id);
      return {
        id: u.id,
        name: p?.name || metaName || u.email || u.id.slice(0, 8),
        email: u.email ?? null,
        brandId: p?.brandId ?? null,
        userId: u.id,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/** Round-robin balancing: fills the lightest-loaded staff first, in order. */
export function balanceAssignments(
  orderIds: string[],
  staffIds: string[],
  currentLoad: Map<string, number>,
): Array<{ orderId: string; employeeId: string }> {
  if (!staffIds.length) return [];
  const load = new Map<string, number>(staffIds.map((id) => [id, currentLoad.get(id) ?? 0]));
  const out: Array<{ orderId: string; employeeId: string }> = [];
  for (const orderId of orderIds) {
    let pick = staffIds[0]!;
    for (const id of staffIds) {
      if ((load.get(id) ?? 0) < (load.get(pick) ?? 0)) pick = id;
    }
    load.set(pick, (load.get(pick) ?? 0) + 1);
    out.push({ orderId, employeeId: pick });
  }
  return out;
}

export type AssignmentMethod = "manual" | "auto" | "unassign";

/**
 * Writes the distribution audit trail and pushes an in-app notification to the
 * app user that received each order.
 */
export async function recordAssignments(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  /** orderId -> assigned auth user id (null = unassigned) */
  assignments: Array<{ orderId: string; assignedUserId: string | null }>;
  method: AssignmentMethod;
  reason?: string | null;
}): Promise<void> {
  const list = opts.assignments.filter((a) => a.orderId).slice(0, 500);
  if (!list.length) return;
  const orderIds = list.map((a) => a.orderId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, external_order_number, assigned_user_id")
    .in("id", orderIds);

  const orderMap = new Map(
    ((orders ?? []) as Array<{
      id: string;
      external_order_number: string | null;
      assigned_user_id: string | null;
    }>).map((o) => [o.id, o]),
  );

  const logRows = list.map((a) => ({
    order_id: a.orderId,
    previous_assigned_user_id: orderMap.get(a.orderId)?.assigned_user_id ?? null,
    assigned_user_id: a.assignedUserId,
    method: opts.method,
    reason: opts.reason ?? (opts.method === "auto" ? "توزيع تلقائي متوازن" : null),
    performed_by: opts.userId,
  }));
  await opts.supabase.from("order_assignment_log").insert(logRows);

  const notifs: Array<{ user_id: string; kind: string; title: string; body: string; link: string }> = [];
  for (const a of list) {
    if (!a.assignedUserId || a.assignedUserId === orderMap.get(a.orderId)?.assigned_user_id) continue;
    const num = orderMap.get(a.orderId)?.external_order_number ?? a.orderId.slice(0, 8);
    notifs.push({
      user_id: a.assignedUserId,
      kind: "order_assigned",
      title: `أوردر جديد لك: #${num}`,
      body: opts.method === "auto" ? "تم إسناده تلقائيًا" : "تم إسناده يدويًا",
      link: `/order-view/${a.orderId}`,
    });
  }

  if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
}
