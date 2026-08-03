import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Clock, Plus, Trash2, Save, Settings2, Link as LinkIcon } from "lucide-react";
import {
  listEmployeesWithSalary,
  upsertEmployee,
  listLinkableUsers,
  linkEmployeeUser,
} from "@/lib/employees.functions";
import { useLang } from "@/lib/i18n";

import {
  listTimeLogs,
  upsertTimeLog,
  deleteTimeLog,
  type TimeLog,
} from "@/lib/attendance.functions";
import { getMyRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/_app/hr/attendance")({
  head: () => ({
    meta: [
      { title: "الحضور والانصراف — e-GURUS" },
      {
        name: "description",
        content:
          "تسجيل مواعيد الحضور والانصراف اليومية للموظفين، وحساب التأخير والأوفر تايم يومي/أسبوعي/شهري/سنوي.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AttendancePage,
});

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TZ_OFFSET_MIN = 0; // stored as local wall-clock time

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m + TZ_OFFSET_MIN;
}
function fmtDur(min: number, lang: "ar" | "en" = "ar"): string {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  return lang === "ar" ? `${s}${h}س ${m}د` : `${s}${h}h ${m}m`;
}

type Employee = Awaited<ReturnType<typeof listEmployeesWithSalary>>[number];

function computeMetrics(log: TimeLog, emp: Employee | undefined) {
  const ci = toMinutes(log.check_in);
  const co = toMinutes(log.check_out);
  const ws = toMinutes(emp?.work_start_time ?? null);
  const we = toMinutes(emp?.work_end_time ?? null);
  const worked = ci != null && co != null ? Math.max(0, co - ci) : 0;
  const late = ci != null && ws != null ? Math.max(0, ci - ws) : 0;
  const overtime = co != null && we != null ? Math.max(0, co - we) : 0;
  return { worked, late, overtime };
}

function hourlyRate(emp: Employee): number {
  const manual = Number((emp as { hourly_rate?: number | null }).hourly_rate || 0);
  if (manual > 0) return manual;
  const salary = Number(emp.salary || 0);
  const hours = Number(emp.monthly_work_hours || 0);
  if (!salary || !hours) return 0;
  return salary / hours;
}

function AttendancePage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listEmpFn = useServerFn(listEmployeesWithSalary);
  const upEmpFn = useServerFn(upsertEmployee);
  const listLogsFn = useServerFn(listTimeLogs);
  const upLogFn = useServerFn(upsertTimeLog);
  const delLogFn = useServerFn(deleteTimeLog);
  const getRoleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite =
    !!roleQ.data &&
    roleQ.data.roles.some((r) =>
      ["admin", "manager", "data_entry", "accountant", "hr"].includes(r),
    );

  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listEmpFn() });
  const employees = empQ.data ?? [];

  const listUsersFn = useServerFn(listLinkableUsers);
  const linkFn = useServerFn(linkEmployeeUser);
  const usersQ = useQuery({ queryKey: ["hr-linkable-users"], queryFn: () => listUsersFn() });
  const users = usersQ.data ?? [];
  const linkUser = useMutation({
    mutationFn: (d: { employeeId: string; userId: string | null }) => linkFn({ data: d }),
    onSuccess: () => {
      toast.success(T("تم تحديث الربط", "Link updated"));
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["hr-linkable-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل الربط", "Link failed")),
  });

  // Period
  const today = new Date();
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [anchor, setAnchor] = useState<string>(getTodayInBusinessTimezone());
  const [empFilter, setEmpFilter] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const d = new Date(anchor + "T00:00:00");
    if (period === "day") {
      const s = d.toISOString().slice(0, 10);
      return { from: s, to: s };
    }
    if (period === "week") {
      const day = d.getDay();
      const start = new Date(d);
      start.setDate(d.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    if (period === "month") {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
    }
    const start = new Date(d.getFullYear(), 0, 1);
    const end = new Date(d.getFullYear(), 11, 31);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }, [period, anchor]);

  const logsQ = useQuery({
    queryKey: ["time-logs", from, to, empFilter],
    queryFn: () =>
      listLogsFn({ data: { from, to, employee_id: empFilter === "all" ? null : empFilter } }),
  });
  const logs = logsQ.data ?? [];

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const saveLog = useMutation({
    mutationFn: (d: Parameters<typeof upLogFn>[0]["data"]) => upLogFn({ data: d }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      qc.invalidateQueries({ queryKey: ["time-logs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل الحفظ", "Save failed")),
  });
  const delLog = useMutation({
    mutationFn: (id: string) => delLogFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["time-logs"] });
    },
  });
  const saveEmp = useMutation({
    mutationFn: (d: Parameters<typeof upEmpFn>[0]["data"]) => upEmpFn({ data: d }),
    onSuccess: () => {
      toast.success(T("تم تحديث الجدول", "Schedule updated"));
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")),
  });

  // Report aggregation per employee
  const report = useMemo(() => {
    const per = new Map<string, { days: number; worked: number; late: number; overtime: number }>();
    for (const log of logs) {
      const emp = empMap.get(log.employee_id);
      const m = computeMetrics(log, emp);
      const cur = per.get(log.employee_id) ?? { days: 0, worked: 0, late: 0, overtime: 0 };
      cur.days += 1;
      cur.worked += m.worked;
      cur.late += m.late;
      cur.overtime += m.overtime;
      per.set(log.employee_id, cur);
    }
    return Array.from(per.entries())
      .map(([empId, v]) => {
        const emp = empMap.get(empId);
        const rate = emp ? hourlyRate(emp) : 0;
        const lateDeduction = rate * (v.late / 60);
        const overtimePay = rate * (v.overtime / 60);
        return { emp, ...v, rate, lateDeduction, overtimePay, net: overtimePay - lateDeduction };
      })
      .sort((a, b) => (a.emp?.name ?? "").localeCompare(b.emp?.name ?? ""));
  }, [logs, empMap]);

  const totals = report.reduce(
    (acc, r) => ({
      late: acc.late + r.late,
      overtime: acc.overtime + r.overtime,
      lateDeduction: acc.lateDeduction + r.lateDeduction,
      overtimePay: acc.overtimePay + r.overtimePay,
    }),
    { late: 0, overtime: 0, lateDeduction: 0, overtimePay: 0 },
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Clock className="w-7 h-7 text-primary" /> {T("الحضور والانصراف", "Attendance")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "سجّل مواعيد دخول وخروج كل موظف، والنظام يحسب التأخير والأوفر تايم والخصم أو المكافأة بالساعة.",
              "Log each employee's check-in and check-out times; the system calculates lateness, overtime, and hourly deductions or bonuses.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select
            value={period}
            onValueChange={(v: "day" | "week" | "month" | "year") => setPeriod(v)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{T("يومي", "Daily")}</SelectItem>
              <SelectItem value="week">{T("أسبوعي", "Weekly")}</SelectItem>
              <SelectItem value="month">{T("شهري", "Monthly")}</SelectItem>
              <SelectItem value="year">{T("سنوي", "Yearly")}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            dir="ltr"
            className="w-40"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
          />
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={T("كل الموظفين", "All employees")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T("كل الموظفين", "All employees")}</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={T("عدد السجلات", "Number of records")} value={logs.length} />
        <Kpi
          label={T("إجمالي التأخير", "Total lateness")}
          value={fmtDur(totals.late, lang)}
          color="text-amber-500"
        />
        <Kpi
          label={T("إجمالي الأوفر تايم", "Total overtime")}
          value={fmtDur(totals.overtime, lang)}
          color="text-emerald-500"
        />
        <Kpi
          label={T("صافي مكافآت − خصومات", "Net bonuses − deductions")}
          value={Math.round(totals.overtimePay - totals.lateDeduction).toLocaleString("en-US")}
          color={
            totals.overtimePay - totals.lateDeduction >= 0 ? "text-emerald-500" : "text-destructive"
          }
        />
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">{T("تسجيل يومي", "Daily log")}</TabsTrigger>
          <TabsTrigger value="report">
            {T("تقرير التأخير/الأوفر تايم", "Lateness/Overtime report")}
          </TabsTrigger>
          <TabsTrigger value="schedule">{T("جداول العمل", "Work schedules")}</TabsTrigger>
          <TabsTrigger value="links">{T("ربط الحسابات", "Account linking")}</TabsTrigger>
        </TabsList>

        {/* LOG ENTRY */}
        <TabsContent value="log" className="space-y-4 mt-4">
          {canWrite && <QuickLogForm employees={employees} onSave={(d) => saveLog.mutate(d)} />}
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold">
              {T(
                `السجلات من ${from} إلى ${to} (${logs.length})`,
                `Records from ${from} to ${to} (${logs.length})`,
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("التاريخ", "Date")}</th>
                    <th className="p-3">{T("الموظف", "Employee")}</th>
                    <th className="p-3 text-center">{T("حضور", "Check-in")}</th>
                    <th className="p-3 text-center">{T("انصراف", "Check-out")}</th>
                    <th className="p-3 text-center">{T("ساعات عمل", "Hours worked")}</th>
                    <th className="p-3 text-center">{T("تأخير", "Lateness")}</th>
                    <th className="p-3 text-center">{T("أوفر تايم", "Overtime")}</th>
                    <th className="p-3">{T("ملاحظة", "Note")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const emp = empMap.get(log.employee_id);
                    const m = computeMetrics(log, emp);
                    return (
                      <tr key={log.id} className="border-b border-border/50">
                        <td className="p-3 font-mono text-xs" dir="ltr">
                          {log.log_date}
                        </td>
                        <td className="p-3 font-medium">{emp?.name ?? "—"}</td>
                        <td className="p-3 text-center font-mono" dir="ltr">
                          {log.check_in?.slice(0, 5) ?? "—"}
                        </td>
                        <td className="p-3 text-center font-mono" dir="ltr">
                          {log.check_out?.slice(0, 5) ?? "—"}
                        </td>
                        <td className="p-3 text-center">{fmtDur(m.worked, lang)}</td>
                        <td className="p-3 text-center text-amber-500">
                          {m.late ? fmtDur(m.late, lang) : "—"}
                        </td>
                        <td className="p-3 text-center text-emerald-500">
                          {m.overtime ? fmtDur(m.overtime, lang) : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{log.note ?? ""}</td>
                        <td className="p-3 text-left">
                          {canWrite && <ConfirmDelete onConfirm={() => delLog.mutate(log.id)} />}
                        </td>
                      </tr>
                    );
                  })}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        {T("لا يوجد سجلات في هذه الفترة.", "No records in this period.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* REPORT */}
        <TabsContent value="report" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold">
              {T(`تقرير الفترة (${from} — ${to})`, `Period report (${from} — ${to})`)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الموظف", "Employee")}</th>
                    <th className="p-3 text-center">{T("أيام مسجلة", "Days logged")}</th>
                    <th className="p-3 text-center">{T("إجمالي عمل", "Total worked")}</th>
                    <th className="p-3 text-center">{T("إجمالي تأخير", "Total lateness")}</th>
                    <th className="p-3 text-center">{T("إجمالي أوفر تايم", "Total overtime")}</th>
                    <th className="p-3 text-center">{T("سعر الساعة", "Hourly rate")}</th>
                    <th className="p-3 text-center">{T("خصم التأخير", "Lateness deduction")}</th>
                    <th className="p-3 text-center">{T("مكافأة الأوفر تايم", "Overtime bonus")}</th>
                    <th className="p-3 text-center">{T("الصافي", "Net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.emp?.id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{r.emp?.name ?? "—"}</td>
                      <td className="p-3 text-center">{r.days}</td>
                      <td className="p-3 text-center">{fmtDur(r.worked, lang)}</td>
                      <td className="p-3 text-center text-amber-500">{fmtDur(r.late, lang)}</td>
                      <td className="p-3 text-center text-emerald-500">
                        {fmtDur(r.overtime, lang)}
                      </td>
                      <td className="p-3 text-center num">
                        {r.rate ? (
                          r.rate.toFixed(2)
                        ) : (
                          <span className="text-muted-foreground">
                            {T("حدد الجدول", "Set schedule")}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center num text-destructive">
                        {Math.round(r.lateDeduction).toLocaleString("en-US")}
                      </td>
                      <td className="p-3 text-center num text-emerald-500">
                        {Math.round(r.overtimePay).toLocaleString("en-US")}
                      </td>
                      <td
                        className={`p-3 text-center num font-semibold ${r.net >= 0 ? "text-emerald-500" : "text-destructive"}`}
                      >
                        {Math.round(r.net).toLocaleString("en-US")}
                      </td>
                    </tr>
                  ))}
                  {report.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">
                        {T("لا بيانات في هذه الفترة.", "No data in this period.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground p-3 border-t border-border">
              {T(
                `* سعر الساعة = المرتب الشهري ÷ ساعات العمل الشهرية للموظف (من تبويب "جداول العمل").`,
                `* Hourly rate = monthly salary ÷ the employee's monthly work hours (from the "Work schedules" tab).`,
              )}
              <br />
              {T(
                "* الخصم / المكافأة = الوقت × سعر الساعة.",
                "* Deduction / bonus = time × hourly rate.",
              )}
            </p>
          </Card>
        </TabsContent>

        {/* SCHEDULES */}
        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> {T("جداول عمل الموظفين", "Employee work schedules")}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الموظف", "Employee")}</th>
                    <th className="p-3 text-center">{T("بداية الدوام", "Shift start")}</th>
                    <th className="p-3 text-center">{T("نهاية الدوام", "Shift end")}</th>
                    <th className="p-3 text-center">{T("ساعات شهرية", "Monthly hours")}</th>
                    <th className="p-3 text-center">
                      {T("أيام الإجازة الأسبوعية", "Weekly off days")}
                    </th>
                    <th className="p-3 text-center">
                      {T("سعر الساعة يدوي", "Manual hourly rate")}
                    </th>
                    <th className="p-3 text-center">
                      {T("سعر الساعة الفعلي", "Effective hourly rate")}
                    </th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <ScheduleRow
                      key={e.id}
                      emp={e}
                      canWrite={canWrite}
                      onSave={(v) =>
                        saveEmp.mutate({
                          id: e.id,
                          name: e.name,
                          brand_id: e.brand_id,
                          salary: e.salary,
                          position: e.position,
                          active: e.active,
                          note: e.note,
                          ...v,
                        })
                      }
                    />
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-muted-foreground">
                        {T(
                          "لا يوجد موظفون. أضفهم من تقرير الأداء.",
                          "No employees. Add them from the performance report.",
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* USER LINKS */}
        <TabsContent value="links" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />{" "}
              {T("ربط الموظفين بحسابات المستخدمين", "Link employees to user accounts")}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الموظف", "Employee")}</th>
                    <th className="p-3">{T("الوظيفة", "Position")}</th>
                    <th className="p-3">{T("حساب المستخدم (الإيميل)", "User account (email)")}</th>
                    <th className="p-3 text-center">{T("الحالة", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => {
                    const linkedUser = users.find((u) => u.id === e.user_id);
                    return (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="p-3 font-medium">{e.name}</td>
                        <td className="p-3 text-muted-foreground text-xs">{e.position ?? "—"}</td>
                        <td className="p-3">
                          <Select
                            value={e.user_id ?? "none"}
                            disabled={!canWrite || usersQ.isLoading}
                            onValueChange={(v) =>
                              linkUser.mutate({ employeeId: e.id, userId: v === "none" ? null : v })
                            }
                          >
                            <SelectTrigger className="w-64">
                              <SelectValue placeholder={T("غير مرتبط", "Not linked")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{T("غير مرتبط", "Not linked")}</SelectItem>
                              {users.map((u) => (
                                <SelectItem
                                  key={u.id}
                                  value={u.id}
                                  disabled={!!u.linkedEmployeeId && u.linkedEmployeeId !== e.id}
                                >
                                  {u.email}
                                  {u.linkedEmployeeId && u.linkedEmployeeId !== e.id
                                    ? T(" (مرتبط بموظف آخر)", " (linked to another employee)")
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-center">
                          {e.user_id ? (
                            <Badge variant="secondary">
                              {linkedUser?.email ?? T("مرتبط", "Linked")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{T("غير مرتبط", "Not linked")}</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        {T("لا يوجد موظفون.", "No employees.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground p-3 border-t border-border">
              {T(
                "* الربط بيخلي الموظف يقدر يقدّم طلبات سلف وإجازات من حسابه، وتظهر بياناته في الحضور والتقارير.",
                "* Linking lets the employee submit leave and advance requests from their own account, and shows their data in attendance and reports.",
              )}
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuickLogForm({
  employees,
  onSave,
}: {
  employees: Employee[];
  onSave: (d: {
    employee_id: string;
    log_date: string;
    check_in: string | null;
    check_out: string | null;
    note: string | null;
  }) => void;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [logDate, setLogDate] = useState(getTodayInBusinessTimezone());
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card className="card-gradient p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{T("تسجيل حضور/انصراف", "Log check-in/check-out")}</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> {T("سجل جديد", "New record")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{T("تسجيل حضور/انصراف", "Log check-in/check-out")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{T("الموظف *", "Employee *")}</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={T("اختر", "Select")} />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>{T("التاريخ", "Date")}</Label>
                  <Input
                    type="date"
                    dir="ltr"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{T("حضور", "Check-in")}</Label>
                  <Input
                    type="time"
                    dir="ltr"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div>
                  <Label>{T("انصراف", "Check-out")}</Label>
                  <Input
                    type="time"
                    dir="ltr"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>{T("ملاحظة", "Note")}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => {
                  if (!employeeId) return toast.error(T("اختر الموظف", "Select an employee"));
                  if (!checkIn && !checkOut)
                    return toast.error(
                      T(
                        "أدخل حضور أو انصراف على الأقل",
                        "Enter at least a check-in or check-out time",
                      ),
                    );
                  onSave({
                    employee_id: employeeId,
                    log_date: logDate,
                    check_in: checkIn || null,
                    check_out: checkOut || null,
                    note: note || null,
                  });
                  setOpen(false);
                  setCheckIn("");
                  setCheckOut("");
                  setNote("");
                }}
              >
                <Save className="w-4 h-4" /> {T("حفظ", "Save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function ScheduleRow({
  emp,
  canWrite,
  onSave,
}: {
  emp: Employee;
  canWrite: boolean;
  onSave: (v: {
    work_start_time: string | null;
    work_end_time: string | null;
    monthly_work_hours: number | null;
    off_days: number[] | null;
    hourly_rate: number | null;
  }) => void;
}) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [v, setV] = useState({
    work_start_time: emp.work_start_time?.slice(0, 5) ?? "",
    work_end_time: emp.work_end_time?.slice(0, 5) ?? "",
    monthly_work_hours: Number(emp.monthly_work_hours) || 0,
    off_days: (emp.off_days ?? [5]) as number[],
    hourly_rate: Number((emp as { hourly_rate?: number | null }).hourly_rate) || 0,
  });
  const rate = hourlyRate({
    ...emp,
    monthly_work_hours: v.monthly_work_hours,
    hourly_rate: v.hourly_rate,
  } as Employee);
  const toggleDay = (d: number) => {
    setV((s) => ({
      ...s,
      off_days: s.off_days.includes(d)
        ? s.off_days.filter((x) => x !== d)
        : [...s.off_days, d].sort(),
    }));
  };
  return (
    <tr className="border-b border-border/50">
      <td className="p-3 font-medium">
        {emp.name}
        <div className="text-xs text-muted-foreground">
          {T("مرتب", "Salary")}: {Number(emp.salary || 0).toLocaleString("en-US")}
        </div>
      </td>
      <td className="p-2 text-center">
        <Input
          type="time"
          dir="ltr"
          disabled={!canWrite}
          className="w-28 mx-auto"
          value={v.work_start_time}
          onChange={(e) => setV({ ...v, work_start_time: e.target.value })}
        />
      </td>
      <td className="p-2 text-center">
        <Input
          type="time"
          dir="ltr"
          disabled={!canWrite}
          className="w-28 mx-auto"
          value={v.work_end_time}
          onChange={(e) => setV({ ...v, work_end_time: e.target.value })}
        />
      </td>
      <td className="p-2 text-center">
        <Input
          type="number"
          dir="ltr"
          disabled={!canWrite}
          className="w-24 mx-auto text-left"
          value={v.monthly_work_hours}
          onChange={(e) => setV({ ...v, monthly_work_hours: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className="p-2 text-center">
        <div className="flex flex-wrap gap-1 justify-center">
          {(lang === "ar" ? DAYS_AR : DAYS_EN).map((d, i) => (
            <button
              key={i}
              type="button"
              disabled={!canWrite}
              onClick={() => toggleDay(i)}
              className={`text-[11px] px-2 py-0.5 rounded border ${v.off_days.includes(i) ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </td>
      <td className="p-2 text-center">
        <Input
          type="number"
          step="0.01"
          dir="ltr"
          disabled={!canWrite}
          className="w-24 mx-auto text-left"
          placeholder={T("تلقائي", "Auto")}
          value={v.hourly_rate || ""}
          onChange={(e) => setV({ ...v, hourly_rate: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td className="p-3 text-center">
        {rate > 0 ? (
          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">
            {rate.toFixed(2)} / {T("س", "hr")}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-2 text-left">
        {canWrite && (
          <Button
            size="sm"
            className="gap-1"
            onClick={() =>
              onSave({
                work_start_time: v.work_start_time || null,
                work_end_time: v.work_end_time || null,
                monthly_work_hours: v.monthly_work_hours || null,
                off_days: v.off_days,
                hourly_rate: v.hourly_rate > 0 ? v.hourly_rate : null,
              })
            }
          >
            <Save className="w-3 h-3" /> {T("حفظ", "Save")}
          </Button>
        )}
      </td>
    </tr>
  );
}

function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{T("حذف السجل؟", "Delete record?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {T(
              "سيتم حذف سجل الحضور/الانصراف نهائياً.",
              "This will permanently delete the attendance record.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{T("إلغاء", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{T("حذف", "Delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Kpi({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color ?? ""}`}>{value}</div>
    </Card>
  );
}
