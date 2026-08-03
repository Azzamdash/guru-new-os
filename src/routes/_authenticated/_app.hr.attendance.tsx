import { tr } from "@/lib/i18n";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Clock, Plus, Trash2, Save, Settings2, Link as LinkIcon } from "lucide-react";
import { listEmployeesWithSalary, upsertEmployee, listLinkableUsers, linkEmployeeUser } from "@/lib/employees.functions";

import { listTimeLogs, upsertTimeLog, deleteTimeLog, type TimeLog } from "@/lib/attendance.functions";
import { getMyRole } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/_app/hr/attendance")({
  head: () => ({ meta: [
    { title: "الحضور والانصراف — e-GURUS" },
    { name: "description", content: "تسجيل مواعيد الحضور والانصراف اليومية للموظفين، وحساب التأخير والأوفر تايم يومي/أسبوعي/شهري/سنوي." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: AttendancePage,
});

const DAYS_AR = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
const TZ_OFFSET_MIN = 0; // stored as local wall-clock time

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m + TZ_OFFSET_MIN;
}
function fmtDur(min: number): string {
  const s = min < 0 ? "-" : "";
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `${s}${h}س ${m}د`;
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
  const qc = useQueryClient();
  const listEmpFn = useServerFn(listEmployeesWithSalary);
  const upEmpFn = useServerFn(upsertEmployee);
  const listLogsFn = useServerFn(listTimeLogs);
  const upLogFn = useServerFn(upsertTimeLog);
  const delLogFn = useServerFn(deleteTimeLog);
  const getRoleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite = !!roleQ.data && roleQ.data.roles.some((r) =>
    ["admin","manager","data_entry","accountant","hr"].includes(r));

  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listEmpFn() });
  const employees = empQ.data ?? [];

  const listUsersFn = useServerFn(listLinkableUsers);
  const linkFn = useServerFn(linkEmployeeUser);
  const usersQ = useQuery({ queryKey: ["hr-linkable-users"], queryFn: () => listUsersFn() });
  const users = usersQ.data ?? [];
  const linkUser = useMutation({
    mutationFn: (d: { employeeId: string; userId: string | null }) => linkFn({ data: d }),
    onSuccess: () => {
      toast.success(tr("تم تحديث الربط"));
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["hr-linkable-users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الربط"),
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
      const start = new Date(d); start.setDate(d.getDate() - day);
      const end = new Date(start); end.setDate(start.getDate() + 6);
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
    queryFn: () => listLogsFn({ data: { from, to, employee_id: empFilter === "all" ? null : empFilter } }),
  });
  const logs = logsQ.data ?? [];

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const saveLog = useMutation({
    mutationFn: (d: Parameters<typeof upLogFn>[0]["data"]) => upLogFn({ data: d }),
    onSuccess: () => { toast.success(tr("تم الحفظ")); qc.invalidateQueries({ queryKey: ["time-logs"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });
  const delLog = useMutation({
    mutationFn: (id: string) => delLogFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الحذف")); qc.invalidateQueries({ queryKey: ["time-logs"] }); },
  });
  const saveEmp = useMutation({
    mutationFn: (d: Parameters<typeof upEmpFn>[0]["data"]) => upEmpFn({ data: d }),
    onSuccess: () => { toast.success(tr("تم تحديث الجدول")); qc.invalidateQueries({ queryKey: ["employees"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  // Report aggregation per employee
  const report = useMemo(() => {
    const per = new Map<string, { days: number; worked: number; late: number; overtime: number }>();
    for (const log of logs) {
      const emp = empMap.get(log.employee_id);
      const m = computeMetrics(log, emp);
      const cur = per.get(log.employee_id) ?? { days: 0, worked: 0, late: 0, overtime: 0 };
      cur.days += 1; cur.worked += m.worked; cur.late += m.late; cur.overtime += m.overtime;
      per.set(log.employee_id, cur);
    }
    return Array.from(per.entries()).map(([empId, v]) => {
      const emp = empMap.get(empId);
      const rate = emp ? hourlyRate(emp) : 0;
      const lateDeduction = rate * (v.late / 60);
      const overtimePay = rate * (v.overtime / 60);
      return { emp, ...v, rate, lateDeduction, overtimePay, net: overtimePay - lateDeduction };
    }).sort((a, b) => (a.emp?.name ?? "").localeCompare(b.emp?.name ?? ""));
  }, [logs, empMap]);

  const totals = report.reduce((acc, r) => ({
    late: acc.late + r.late, overtime: acc.overtime + r.overtime,
    lateDeduction: acc.lateDeduction + r.lateDeduction, overtimePay: acc.overtimePay + r.overtimePay,
  }), { late: 0, overtime: 0, lateDeduction: 0, overtimePay: 0 });

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Clock className="w-7 h-7 text-primary" /> ا{tr("الحضور والانصراف")}          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            سجّل مواعيد د{tr("سجّل مواعيد دخول وخروج كل موظف، والنظام يحسب التأخير والأوفر تايم والخصم أو المكافأة بالساعة.")}p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={period} onValueChange={(v: "day" | "week" | "month" | "year") => setPeriod(v)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{tr("يومي")}</SelectItem>
              <SelectItem value="week">{tr("أسبوعي")}</SelectItem>
              <SelectItem value="month">{tr("شهري")}</SelectItem>
              <SelectItem value="year">{tr("سنوي")}</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" dir="ltr" className="w-40" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
          <Select value={empFilter} onValueChange={setEmpFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder={tr("كل الموظفين")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("كل الموظفين")}</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={tr("عدد السجلات")} value={logs.length} />
        <Kpi label={tr("إجمالي التأخير")} value={fmtDur(totals.late)} color="text-amber-500" />
        <Kpi label={tr("إجمالي الأوفر تايم")} value={fmtDur(totals.overtime)} color="text-emerald-500" />
        <Kpi label={tr("صافي مكافآت − خصومات")} value={Math.round(totals.overtimePay - totals.lateDeduction).toLocaleString("en-US")} color={totals.overtimePay - totals.lateDeduction >= 0 ? "text-emerald-500" : "text-destructive"} />
      </div>

      <Tabs defaultValue="log" dir="rtl">
        <TabsList>
          <TabsTrigger value="log">{tr("تسجيل يومي")}</TabsTrigger>
          <TabsTrigger value="report">{tr("تقرير التأخير/الأوفر تايم")}</TabsTrigger>
          <TabsTrigger value="schedule">{tr("جداول العمل")}</TabsTrigger>
          <TabsTrigger value="links">{tr("ربط الحسابات")}</TabsTrigger>

        </TabsList>

        {/* LOG ENTRY */}
        <TabsContent value="log" className="space-y-4 mt-4">
          {canWrite && <QuickLogForm employees={employees} onSave={(d) => saveLog.mutate(d)} />}
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold">
              السجلات من {fro{tr("السجلات من")}لى")}{to} ({logs.length})
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("التاريخ")}</th>
                    <th className="p-3">{tr("الموظف")}</th>
                    <th className="p-3 text-center">{tr("حضور")}</th>
                    <th className="p-3 text-center">{tr("انصراف")}</th>
                    <th className="p-3 text-center">{tr("ساعات عمل")}</th>
                    <th className="p-3 text-center">{tr("تأخير")}</th>
                    <th className="p-3 text-center">{tr("أوفر تايم")}</th>
                    <th className="p-3">{tr("ملاحظة")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const emp = empMap.get(log.employee_id);
                    const m = computeMetrics(log, emp);
                    return (
                      <tr key={log.id} className="border-b border-border/50">
                        <td className="p-3 font-mono text-xs" dir="ltr">{log.log_date}</td>
                        <td className="p-3 font-medium">{emp?.name ?? "—"}</td>
                        <td className="p-3 text-center font-mono" dir="ltr">{log.check_in?.slice(0,5) ?? "—"}</td>
                        <td className="p-3 text-center font-mono" dir="ltr">{log.check_out?.slice(0,5) ?? "—"}</td>
                        <td className="p-3 text-center">{fmtDur(m.worked)}</td>
                        <td className="p-3 text-center text-amber-500">{m.late ? fmtDur(m.late) : "—"}</td>
                        <td className="p-3 text-center text-emerald-500">{m.overtime ? fmtDur(m.overtime) : "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{log.note ?? ""}</td>
                        <td className="p-3 text-left">
                          {canWrite && (
                            <ConfirmDelete onConfirm={() => delLog.mutate(log.id)} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {logs.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{tr("لا يوجد سجلات في هذه الفترة.")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* REPORT */}
        <TabsContent value="report" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold">{tr("تقرير الفترة (")}{from} — {to})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("الموظف")}</th>
                    <th className="p-3 text-center">{tr("أيام مسجلة")}</th>
                    <th className="p-3 text-center">{tr("إجمالي عمل")}</th>
                    <th className="p-3 text-center">{tr("إجمالي تأخير")}</th>
                    <th className="p-3 text-center">{tr("إجمالي أوفر تايم")}</th>
                    <th className="p-3 text-center">{tr("سعر الساعة")}</th>
                    <th className="p-3 text-center">{tr("خصم التأخير")}</th>
                    <th className="p-3 text-center">{tr("مكافأة الأوفر تايم")}</th>
                    <th className="p-3 text-center">{tr("الصافي")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.emp?.id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{r.emp?.name ?? "—"}</td>
                      <td className="p-3 text-center">{r.days}</td>
                      <td className="p-3 text-center">{fmtDur(r.worked)}</td>
                      <td className="p-3 text-center text-amber-500">{fmtDur(r.late)}</td>
                      <td className="p-3 text-center text-emerald-500">{fmtDur(r.overtime)}</td>
                      <td className="p-3 text-center num">{r.rate ? r.rate.toFixed(2) : <span className="text-muted-foreground">{tr("حدد الجدول")}</span>}</td>
                      <td className="p-3 text-center num text-destructive">{Math.round(r.lateDeduction).toLocaleString("en-US")}</td>
                      <td className="p-3 text-center num text-emerald-500">{Math.round(r.overtimePay).toLocaleString("en-US")}</td>
                      <td className={`p-3 text-center num font-semibold ${r.net >= 0 ? "text-emerald-500" : "text-destructive"}`}>{Math.round(r.net).toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                  {report.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{tr("لا بيانات في هذه الفترة.")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground p-3 border-t border-border">
              * سعر الساعة = {tr("* سعر الساعة = المرتب الشهري ÷ ساعات العمل الشهرية للموظف (من تبويب \"جداول العمل\").\n              * الخصم / المكافأة = الوقت × سعر الساعة.")}p>
          </Card>
        </TabsContent>

        {/* SCHEDULES */}
        <TabsContent value="schedule" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> ج{tr("جداول عمل الموظفين")}            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("الموظف")}</th>
                    <th className="p-3 text-center">{tr("بداية الدوام")}</th>
                    <th className="p-3 text-center">{tr("نهاية الدوام")}</th>
                    <th className="p-3 text-center">{tr("ساعات شهرية")}</th>
                    <th className="p-3 text-center">{tr("أيام الإجازة الأسبوعية")}</th>
                    <th className="p-3 text-center">{tr("سعر الساعة يدوي")}</th>
                    <th className="p-3 text-center">{tr("سعر الساعة الفعلي")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <ScheduleRow key={e.id} emp={e} canWrite={canWrite}
                      onSave={(v) => saveEmp.mutate({
                        id: e.id, name: e.name, brand_id: e.brand_id, salary: e.salary,
                        position: e.position, active: e.active, note: e.note, ...v,
                      })} />
                  ))}
                  {employees.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{tr("لا يوجد موظفون. أضفهم من تقرير الأداء.")}</td></tr>
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
              <LinkIcon className="w-4 h-4" /> ر{tr("ربط الموظفين بحسابات المستخدمين")}            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{tr("الموظف")}</th>
                    <th className="p-3">{tr("الوظيفة")}</th>
                    <th className="p-3">{tr("حساب المستخدم (الإيميل)")}</th>
                    <th className="p-3 text-center">{tr("الحالة")}</th>
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
                            <SelectTrigger className="w-64"><SelectValue placeholder={tr("غير مرتبط")} /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{tr("غير مرتبط")}</SelectItem>
                              {users.map((u) => (
                                <SelectItem
                                  key={u.id}
                                  value={u.id}
                                  disabled={!!u.linkedEmployeeId && u.linkedEmployeeId !== e.id}
                                >
                                  {u.email}
                                  {u.linkedEmployeeId && u.linkedEmployeeId !== e.id ? " (مرتبط بموظف آخر)" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-center">
                          {e.user_id
                            ? <Badge variant="secondary">{linkedUser?.email ?? "مرتبط"}</Badge>
                            : <Badge variant="outline">{tr("غير مرتبط")}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                  {employees.length === 0 && (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{tr("لا يوجد موظفون.")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground p-3 border-t border-border">
              * الربط بيخلي ا{tr("* الربط بيخلي الموظف يقدر يقدّم طلبات سلف وإجازات من حسابه، وتظهر بياناته في الحضور والتقارير.")}p>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}

function QuickLogForm({ employees, onSave }: {
  employees: Employee[];
  onSave: (d: { employee_id: string; log_date: string; check_in: string | null; check_out: string | null; note: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [logDate, setLogDate] = useState(getTodayInBusinessTimezone());
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card className="card-gradient p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold">{tr("تسجيل حضور/انصراف")}</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> س{tr("سجل جديد")}/Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{tr("تسجيل حضور/انصراف")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{tr("الموظف *")}</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger><SelectValue placeholder={tr("اختر")} /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>{tr("التاريخ")}</Label><Input type="date" dir="ltr" value={logDate} onChange={(e) => setLogDate(e.target.value)} /></div>
                <div><Label>{tr("حضور")}</Label><Input type="time" dir="ltr" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></div>
                <div><Label>{tr("انصراف")}</Label><Input type="time" dir="ltr" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></div>
              </div>
              <div><Label>{tr("ملاحظة")}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
              <Button className="w-full gap-2" onClick={() => {
                if (!employeeId) return toast.error(tr("اختر الموظف"));
                if (!checkIn && !checkOut) return toast.error(tr("أدخل حضور أو انصراف على الأقل"));
                onSave({
                  employee_id: employeeId, log_date: logDate,
                  check_in: checkIn || null, check_out: checkOut || null,
                  note: note || null,
                });
                setOpen(false); setCheckIn(""); setCheckOut(""); setNote("");
              }}><Save className="w-4 h-4" /> ح{tr("حفظ")}/Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
}

function ScheduleRow({ emp, canWrite, onSave }: {
  emp: Employee;
  canWrite: boolean;
  onSave: (v: { work_start_time: string | null; work_end_time: string | null; monthly_work_hours: number | null; off_days: number[] | null; hourly_rate: number | null }) => void;
}) {
  const [v, setV] = useState({
    work_start_time: emp.work_start_time?.slice(0, 5) ?? "",
    work_end_time: emp.work_end_time?.slice(0, 5) ?? "",
    monthly_work_hours: Number(emp.monthly_work_hours) || 0,
    off_days: (emp.off_days ?? [5]) as number[],
    hourly_rate: Number((emp as { hourly_rate?: number | null }).hourly_rate) || 0,
  });
  const rate = hourlyRate({ ...emp, monthly_work_hours: v.monthly_work_hours, hourly_rate: v.hourly_rate } as Employee);
  const toggleDay = (d: number) => {
    setV((s) => ({ ...s, off_days: s.off_days.includes(d) ? s.off_days.filter((x) => x !== d) : [...s.off_days, d].sort() }));
  };
  return (
    <tr className="border-b border-border/50">
      <td className="p-3 font-medium">{emp.name}<div className="text-xs text-muted-foreground">{tr("مرتب:")} {Number(emp.salary || 0).toLocaleString("en-US")}</div></td>
      <td className="p-2 text-center">
        <Input type="time" dir="ltr" disabled={!canWrite} className="w-28 mx-auto"
          value={v.work_start_time} onChange={(e) => setV({ ...v, work_start_time: e.target.value })} />
      </td>
      <td className="p-2 text-center">
        <Input type="time" dir="ltr" disabled={!canWrite} className="w-28 mx-auto"
          value={v.work_end_time} onChange={(e) => setV({ ...v, work_end_time: e.target.value })} />
      </td>
      <td className="p-2 text-center">
        <Input type="number" dir="ltr" disabled={!canWrite} className="w-24 mx-auto text-left"
          value={v.monthly_work_hours} onChange={(e) => setV({ ...v, monthly_work_hours: parseFloat(e.target.value) || 0 })} />
      </td>
      <td className="p-2 text-center">
        <div className="flex flex-wrap gap-1 justify-center">
          {DAYS_AR.map((d, i) => (
            <button key={i} type="button" disabled={!canWrite}
              onClick={() => toggleDay(i)}
              className={`text-[11px] px-2 py-0.5 rounded border ${v.off_days.includes(i) ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground"}`}>
              {d}
            </button>
          ))}
        </div>
      </td>
      <td className="p-2 text-center">
        <Input type="number" step="0.01" dir="ltr" disabled={!canWrite} className="w-24 mx-auto text-left"
          placeholder={tr("تلقائي")}
          value={v.hourly_rate || ""} onChange={(e) => setV({ ...v, hourly_rate: parseFloat(e.target.value) || 0 })} />
      </td>
      <td className="p-3 text-center">
        {rate > 0 ? <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">{rate.toFixed(2)} /{tr("/ س")}/Badge> : <span className="text-xs text-muted-foreground">—</span>}
      </td>
      <td className="p-2 text-left">
        {canWrite && (
          <Button size="sm" className="gap-1" onClick={() => onSave({
            work_start_time: v.work_start_time || null,
            work_end_time: v.work_end_time || null,
            monthly_work_hours: v.monthly_work_hours || null,
            off_days: v.off_days,
            hourly_rate: v.hourly_rate > 0 ? v.hourly_rate : null,
          })}><Save className="w-3 h-3" /> ح{tr("حفظ")}/Button>
        )}
      </td>
    </tr>
  );
}

function ConfirmDelete({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost"><Trash2 className="w-4 h-4 text-destructive" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("حذف السجل؟")}</AlertDialogTitle>
          <AlertDialogDescription>{tr("سيتم حذف سجل الحضور/الانصراف نهائياً.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("إلغاء")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{tr("حذف")}</AlertDialogAction>
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
