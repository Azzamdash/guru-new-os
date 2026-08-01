/** Server-only helpers for order distribution. */

const DISTRIBUTION_ROUTE = "/order-distribution";

export type StaffMember = {
  id: string;
  name: string;
  brandId: string | null;
  userId: string | null;
};

/**
 * Staff that orders can be distributed to = active employees whose linked app
 * user has access to the distribution page (granted from Users & Permissions),
 * or holds a customer-service / manager-style role.
 */
export async function getEligibleStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<StaffMember[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: grants }, { data: roles }, { data: employees }] = await Promise.all([
    supabaseAdmin
      .from("user_section_access")
      .select("user_id, section")
      .in("section", [
        `page:${DISTRIBUTION_ROUTE}`,
        `write:${DISTRIBUTION_ROUTE}`,
        `deny:${DISTRIBUTION_ROUTE}`,
      ]),
    supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["customer_service", "operation_manager", "fulfillment_manager", "admin", "manager"]),
    supabase.from("employees").select("id, name, brand_id, user_id").eq("active", true).order("name"),
  ]);

  const denied = new Set<string>();
  const allowed = new Set<string>();
  for (const g of (grants ?? []) as Array<{ user_id: string; section: string }>) {
    if (g.section === `deny:${DISTRIBUTION_ROUTE}`) denied.add(g.user_id);
    else allowed.add(g.user_id);
  }
  for (const r of (roles ?? []) as Array<{ user_id: string }>) allowed.add(r.user_id);

  const list = ((employees ?? []) as Array<{
    id: string;
    name: string;
    brand_id: string | null;
    user_id: string | null;
  }>).map((e) => ({ id: e.id, name: e.name, brandId: e.brand_id, userId: e.user_id }));

  const eligible = list.filter((e) => e.userId && allowed.has(e.userId) && !denied.has(e.userId));
  return eligible.length ? eligible : list;
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
 * employee that received each order.
 */
export async function recordAssignments(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  /** orderId -> employeeId (null = unassigned) */
  assignments: Array<{ orderId: string; employeeId: string | null }>;
  method: AssignmentMethod;
  reason?: string | null;
}): Promise<void> {
  const list = opts.assignments.filter((a) => a.orderId).slice(0, 500);
  if (!list.length) return;
  const orderIds = list.map((a) => a.orderId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabaseAdmin.from("orders").select("id, order_number, employee_id, total").in("id", orderIds),
    supabaseAdmin.from("employees").select("id, name, user_id"),
  ]);

  const orderMap = new Map(
    ((orders ?? []) as Array<{ id: string; order_number: string | null; employee_id: string | null }>).map(
      (o) => [o.id, o],
    ),
  );
  const empUser = new Map(
    ((employees ?? []) as Array<{ id: string; user_id: string | null }>).map((e) => [e.id, e.user_id]),
  );

  const logRows = list.map((a) => ({
    order_id: a.orderId,
    previous_employee_id: orderMap.get(a.orderId)?.employee_id ?? null,
    employee_id: a.employeeId,
    method: opts.method,
    reason: opts.reason ?? (opts.method === "auto" ? "توزيع تلقائي متوازن" : null),
    performed_by: opts.userId,
  }));
  await opts.supabase.from("order_assignment_log").insert(logRows);

  const notifs = list
    .filter((a) => a.employeeId && a.employeeId !== orderMap.get(a.orderId)?.employee_id)
    .map((a) => {
      const userId = empUser.get(a.employeeId as string);
      if (!userId) return null;
      const num = orderMap.get(a.orderId)?.order_number ?? a.orderId.slice(0, 8);
      return {
        user_id: userId,
        kind: "order_assigned",
        title: `أوردر جديد لك: #${num}`,
        body: opts.method === "auto" ? "تم إسناده تلقائيًا" : "تم إسناده يدويًا",
        link: `/order-view/${a.orderId}`,
      };
    })
    .filter(Boolean);

  if (notifs.length) await supabaseAdmin.from("notifications").insert(notifs);
}
