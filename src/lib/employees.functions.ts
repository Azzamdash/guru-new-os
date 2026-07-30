import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertWriter(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw error;
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => ["admin", "manager", "data_entry", "accountant"].includes(r))) {
    throw new Error("Forbidden");
  }
}

export type Employee = {
  id: string; name: string; brand_id: string;
  position: string | null; active: boolean;
};

export type EmployeeWithSalary = Employee & {
  note: string | null;
  salary: number;
  work_start_time: string | null;
  work_end_time: string | null;
  monthly_work_hours: number | null;
  off_days: number[] | null;
};


export const listEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("employees")
      .select("id, name, brand_id, position, active")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Employee[];
  });

export const listEmployeesWithSalary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows, error: roleErr } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (roleErr) throw roleErr;
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r: string) => ["admin", "manager", "accountant"].includes(r))) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("employees")
      .select("id, name, brand_id, position, active, note, salary, work_start_time, work_end_time, monthly_work_hours, off_days, hourly_rate")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as EmployeeWithSalary[];
  });

export const upsertEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; name: string; brand_id: string; salary: number;
    position?: string | null; active?: boolean; note?: string | null;
    work_start_time?: string | null; work_end_time?: string | null;
    monthly_work_hours?: number | null; off_days?: number[] | null;
    hourly_rate?: number | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    if (!data.brand_id) throw new Error("البراند إجباري");
    if (data.salary == null || Number(data.salary) < 0) throw new Error("المرتب إجباري");
    const { error } = await context.supabase.from("employees").upsert(data);
    if (error) throw error;
    return { ok: true };
  });


export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase.from("employees").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export type AttendanceRow = {
  id: string; employee_id: string; year: number; month: number;
  days_absent: number; days_vacation: number; times_late: number;
  deductions: number; bonuses: number; note: string | null;
  approved: boolean;
};

export const listAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month?: number | null }) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("employee_attendance_entries")
      .select("id, employee_id, year, month, days_absent, days_vacation, times_late, deductions, bonuses, note, approved")
      .eq("year", data.year);
    if (data.month != null) q = q.eq("month", data.month);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as AttendanceRow[];
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string; employee_id: string; year: number; month: number;
    days_absent?: number; days_vacation?: number; times_late?: number;
    deductions?: number; bonuses?: number; note?: string | null;
    approved?: boolean;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase
      .from("employee_attendance_entries")
      .upsert(data, { onConflict: "employee_id,year,month" });
    if (error) throw error;
    return { ok: true };
  });

export const deleteAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertWriter(context);
    const { error } = await context.supabase
      .from("employee_attendance_entries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
