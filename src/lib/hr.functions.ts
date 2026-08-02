import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function isHR(context: Ctx) {
  const results = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "manager" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hr" }),
  ]);
  return results.some((r) => !r.error && r.data === true);
}

export type EmployeeRequest = {
  id: string;
  user_id: string;
  employee_id: string | null;
  type: "leave" | "advance";
  requested_date: string;
  amount: number | null;
  note: string | null;
  proof_url: string | null;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

/** Minimum requested date (today + 2 days) as YYYY-MM-DD. */
export function minRequestDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("employee_requests")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmployeeRequest[];
  });

export const listAllRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isHR(context))) throw new Error("Forbidden");
    const { data, error } = await context.supabase
      .from("employee_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as EmployeeRequest[];
  });

export const createRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    type: "leave" | "advance";
    requested_date: string;
    amount?: number | null;
    note?: string | null;
    employee_id?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    if (!data.type || !data.requested_date) throw new Error("Missing fields");
    if (data.requested_date < minRequestDate()) {
      throw new Error("Requested date must be at least 2 days from today");
    }
    // employee_id must reference the employee row linked to the signed-in user (RLS)
    const { data: emp, error: empErr } = await context.supabase
      .from("employees")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (empErr) throw empErr;
    if (!emp?.id) {
      throw new Error(
        "لا يوجد ملف موظف مرتبط بحسابك. اطلب من الإدارة ربط حسابك بسجل موظف قبل تقديم الطلبات."
      );
    }
    const { error } = await context.supabase.from("employee_requests").insert({
      user_id: context.userId,
      type: data.type,
      requested_date: data.requested_date,
      amount: data.type === "advance" ? (data.amount ?? null) : null,
      note: data.note ?? null,
      employee_id: emp.id,
    });
    if (error) throw error;
    return { ok: true };
  });

export const cancelMyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("employee_requests")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw error;
    return { ok: true };
  });

export const reviewRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    status: "approved" | "rejected";
    proof_url?: string | null;
    review_note?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    if (!(await isHR(context))) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("employee_requests")
      .update({
        status: data.status,
        proof_url: data.proof_url ?? null,
        review_note: data.review_note ?? null,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });