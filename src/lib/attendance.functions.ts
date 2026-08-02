import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getTodayInBusinessTimezone } from "@/lib/timezone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { supabase: any; userId: string };

async function assertHr(context: Ctx) {
  const { data, error } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw error;
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.some((r: string) => ["admin", "manager", "accountant", "data_entry", "hr"].includes(r))) {
    throw new Error("Forbidden");
  }
}

export type TimeLog = {
  id: string;
  employee_id: string;
  log_date: string;      // YYYY-MM-DD
  check_in: string | null;   // HH:MM:SS
  check_out: string | null;
  note: string | null;
};

export const listTimeLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string; employee_id?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertHr(context);
    let q = context.supabase
      .from("employee_time_logs")
      .select("id, employee_id, log_date, check_in, check_out, note")
      .gte("log_date", data.from)
      .lte("log_date", data.to)
      .order("log_date", { ascending: false });
    if (data.employee_id) q = q.eq("employee_id", data.employee_id);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []) as TimeLog[];
  });

export const upsertTimeLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    employee_id: string;
    log_date: string;
    check_in?: string | null;
    check_out?: string | null;
    note?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertHr(context);
    if (!data.employee_id) throw new Error("اختر الموظف");
    if (!data.log_date) throw new Error("اختر التاريخ");
    const { error } = await context.supabase
      .from("employee_time_logs")
      .upsert(data, { onConflict: "employee_id,log_date" });
    if (error) throw error;
    return { ok: true };
  });

export const deleteTimeLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { error } = await context.supabase
      .from("employee_time_logs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ===== Auto-computed monthly attendance report =====

export type ComputedAttendance = {
  employee_id: string;
  working_days: number;
  worked_days: number;
  days_absent: number;
  days_vacation: number;
  times_late: number;
  late_minutes: number;
  overtime_minutes: number;
  deductions: number;
  bonuses: number;
  hourly_rate: number;
};

function toMin(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Last day of the month that has actually elapsed, in the business timezone.
 * For a past month this is the same as the calendar's last day. For the
 * current, still-in-progress month it's clamped to today, so approving
 * attendance mid-month doesn't count the remaining, not-yet-happened days
 * as absences. For a future month it's 0 (no elapsed days yet).
 */
function elapsedLastDay(year: number, month: number, calendarLastDay: number): number {
  const [ty, tm, td] = getTodayInBusinessTimezone().split("-").map(Number);
  if (year < ty || (year === ty && month < tm)) return calendarLastDay;
  if (year === ty && month === tm) return Math.min(calendarLastDay, td);
  return 0;
}

type AttendanceEmployee = {
  id: string;
  salary: number | null;
  work_start_time: string | null;
  work_end_time: string | null;
  monthly_work_hours: number | null;
  off_days: number[] | null;
  hourly_rate: number | null;
};

async function computeAttendanceRows(
  context: Ctx,
  year: number,
  month: number,
  employeeColumns: string,
): Promise<{ emps: AttendanceEmployee[]; rows: ComputedAttendance[] }> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const effectiveLastDay = elapsedLastDay(year, month, lastDay);

  const [empRes, logsRes, reqRes] = await Promise.all([
    context.supabase.from("employees").select(employeeColumns),
    context.supabase.from("employee_time_logs")
      .select("employee_id, log_date, check_in, check_out")
      .gte("log_date", from).lte("log_date", to),
    context.supabase.from("employee_requests")
      .select("employee_id, requested_date, type, status")
      .eq("type", "leave").eq("status", "approved")
      .gte("requested_date", from).lte("requested_date", to),
  ]);
  if (empRes.error) throw empRes.error;
  if (logsRes.error) throw logsRes.error;
  if (reqRes.error) throw reqRes.error;

  const emps = (empRes.data ?? []) as AttendanceEmployee[];
  const logs = (logsRes.data ?? []) as { employee_id: string; log_date: string; check_in: string | null; check_out: string | null }[];
  const leaves = (reqRes.data ?? []) as { employee_id: string | null; requested_date: string }[];

  const workingDaysFor = (off: number[] | null): number => {
    const set = new Set((off ?? []).map(Number));
    let n = 0;
    for (let d = 1; d <= effectiveLastDay; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      if (!set.has(dow)) n++;
    }
    return n;
  };

  const logsByEmp = new Map<string, typeof logs>();
  for (const l of logs) {
    const arr = logsByEmp.get(l.employee_id) ?? [];
    arr.push(l); logsByEmp.set(l.employee_id, arr);
  }
  const leaveDaysByEmp = new Map<string, Set<string>>();
  for (const r of leaves) {
    if (!r.employee_id) continue;
    const s = leaveDaysByEmp.get(r.employee_id) ?? new Set<string>();
    s.add(r.requested_date); leaveDaysByEmp.set(r.employee_id, s);
  }

  const rows: ComputedAttendance[] = emps.map((e) => {
    const salary = Number(e.salary || 0);
    const mHours = Number(e.monthly_work_hours || 0);
    const manualHr = Number(e.hourly_rate || 0);
    const hr = manualHr > 0 ? manualHr : (salary && mHours ? salary / mHours : 0);
    const ws = toMin(e.work_start_time);
    const we = toMin(e.work_end_time);
    const working = workingDaysFor(e.off_days);
    const empLogs = logsByEmp.get(e.id) ?? [];
    const vacationDays = leaveDaysByEmp.get(e.id)?.size ?? 0;
    let workedDays = 0, timesLate = 0, lateMin = 0, otMin = 0;
    for (const l of empLogs) {
      const ci = toMin(l.check_in);
      const co = toMin(l.check_out);
      if (ci != null) workedDays++;
      if (ci != null && ws != null && ci > ws) { timesLate++; lateMin += ci - ws; }
      if (co != null && we != null && co > we) { otMin += co - we; }
    }
    const daysAbsent = Math.max(0, working - workedDays - vacationDays);
    const perDay = working > 0 ? salary / working : 0;
    const deductions = Math.round((lateMin / 60) * hr + daysAbsent * perDay);
    const bonuses = Math.round((otMin / 60) * hr);
    return {
      employee_id: e.id,
      working_days: working, worked_days: workedDays,
      days_absent: daysAbsent, days_vacation: vacationDays,
      times_late: timesLate, late_minutes: lateMin, overtime_minutes: otMin,
      deductions, bonuses, hourly_rate: Math.round(hr * 100) / 100,
    };
  });
  return { emps, rows };
}

export const computeAttendanceReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => d)
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { rows } = await computeAttendanceRows(
      context,
      data.year,
      data.month,
      "id, salary, work_start_time, work_end_time, monthly_work_hours, off_days, hourly_rate, active",
    );
    return rows;
  });

export const approveComputedAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { year: number; month: number }) => d)
  .handler(async ({ data, context }) => {
    await assertHr(context);
    const { year, month } = data;
    const { rows: computed } = await computeAttendanceRows(
      context,
      year,
      month,
      "id, salary, work_start_time, work_end_time, monthly_work_hours, off_days, hourly_rate",
    );
    const rows = computed.map((r) => ({
      employee_id: r.employee_id,
      year, month,
      days_absent: r.days_absent,
      days_vacation: r.days_vacation,
      times_late: r.times_late,
      deductions: r.deductions,
      bonuses: r.bonuses,
      note: "auto-computed",
      approved: true,
    }));
    if (rows.length === 0) return { ok: true, count: 0 };
    const { error } = await context.supabase.from("employee_attendance_entries").upsert(rows, { onConflict: "employee_id,year,month" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });
