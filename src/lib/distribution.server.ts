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
