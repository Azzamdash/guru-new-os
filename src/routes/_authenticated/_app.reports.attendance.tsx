import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
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
import { UserCheck, Plus, Trash2, Users, CheckCircle2, RefreshCw } from "lucide-react";

import { listBrands } from "@/lib/internal.functions";
import { listEmployeesWithSalary, upsertEmployee, deleteEmployee } from "@/lib/employees.functions";
import { computeAttendanceReport, approveComputedAttendance } from "@/lib/attendance.functions";
import { getMyRole } from "@/lib/admin.functions";
import { ReportActions } from "@/components/ReportActions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/reports/attendance")({
  head: () => ({
    meta: [
      { title: "تقرير أداء الموظفين — e-GURUS" },
      {
        name: "description",
        content: "تقرير أداء الموظفين شهرياً: الغياب، الإجازات، التأخيرات، الخصومات والمكافآت.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AttendancePage,
});

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function AttendancePage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const MONTHS = lang === "ar" ? MONTHS_AR : MONTHS_EN;
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listEmpFn = useServerFn(listEmployeesWithSalary);
  const upEmpFn = useServerFn(upsertEmployee);
  const delEmpFn = useServerFn(deleteEmployee);
  const computeFn = useServerFn(computeAttendanceReport);
  const approveFn = useServerFn(approveComputedAttendance);
  const getRoleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite =
    !!roleQ.data &&
    roleQ.data.roles.some((r) => ["admin", "manager", "data_entry", "accountant"].includes(r));

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listEmpFn() });
  const computedQ = useQuery({
    queryKey: ["attendance-computed", year, month],
    queryFn: () => computeFn({ data: { year, month } }),
  });

  const brands = brandsQ.data ?? [];
  const employees = empQ.data ?? [];
  const computed = computedQ.data ?? [];

  const compByEmp = useMemo(() => {
    const m = new Map<string, (typeof computed)[number]>();
    computed.forEach((c) => m.set(c.employee_id, c));
    return m;
  }, [computed]);

  const [newEmp, setNewEmp] = useState({ name: "", brand_id: "", position: "", salary: 0 });

  const saveEmp = useMutation({
    mutationFn: (d: Parameters<typeof upEmpFn>[0]["data"]) => upEmpFn({ data: d }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["expense-entries"] });
      setNewEmp({ name: "", brand_id: "", position: "", salary: 0 });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل الحفظ", "Save failed")),
  });
  const delEmp = useMutation({
    mutationFn: (id: string) => delEmpFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["attendance-computed"] });
    },
  });
  const approveMonth = useMutation({
    mutationFn: () => approveFn({ data: { year, month } }),
    onSuccess: (r) => {
      toast.success(T(`تم اعتماد ${r.count} سجل`, `${r.count} record(s) approved`));
      qc.invalidateQueries({ queryKey: ["expense-entries"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : T("فشل", "Failed")),
  });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  // Report calculations (auto from time logs)
  const report = employees.map((e) => {
    const c = compByEmp.get(e.id);
    const absent = c?.days_absent ?? 0;
    const vacation = c?.days_vacation ?? 0;
    const late = c?.times_late ?? 0;
    const lateMin = c?.late_minutes ?? 0;
    const otMin = c?.overtime_minutes ?? 0;
    const deductions = c?.deductions ?? 0;
    const bonuses = c?.bonuses ?? 0;
    const working = c?.working_days ?? 26;
    const worked = c?.worked_days ?? 0;
    const attendanceRate =
      working > 0 ? Math.max(0, Math.min(1, (worked + vacation) / working)) : 0;
    const rating =
      attendanceRate >= 0.95 && late <= 1
        ? { label: T("ممتاز", "Excellent"), cls: "bg-emerald-500/15 text-emerald-500" }
        : attendanceRate >= 0.85 && late <= 3
          ? { label: T("جيد", "Good"), cls: "bg-blue-500/15 text-blue-500" }
          : attendanceRate >= 0.7
            ? { label: T("مقبول", "Acceptable"), cls: "bg-amber-500/15 text-amber-500" }
            : { label: T("ضعيف", "Weak"), cls: "bg-destructive/15 text-destructive" };
    return {
      emp: e,
      absent,
      vacation,
      late,
      lateMin,
      otMin,
      deductions,
      bonuses,
      working,
      worked,
      attendanceRate,
      rating,
    };
  });

  const totals = report.reduce(
    (acc, r) => ({
      absent: acc.absent + r.absent,
      vacation: acc.vacation + r.vacation,
      late: acc.late + r.late,
      deductions: acc.deductions + r.deductions,
      bonuses: acc.bonuses + r.bonuses,
    }),
    { absent: 0, vacation: 0, late: 0, deductions: 0, bonuses: 0 },
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <UserCheck className="w-7 h-7 text-primary" />{" "}
            {T("انتظام الموظفين", "Employee Attendance")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {T(
              "تقرير تلقائي محسوب من سجلات الحضور والانصراف وطلبات الإجازة — لا يحتاج إدخال يدوي.",
              "An automatic report computed from check-in/check-out records and leave requests — no manual entry needed.",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ReportActions
            filename={`attendance-${year}-${month}.csv`}
            summaryTitle={`انتظام ${MONTHS[month - 1]} ${year}`}
            summaryText={`عدد الموظفين: ${employees.length} · غياب: ${totals.absent} · إجازات: ${totals.vacation} · تأخيرات: ${totals.late}`}
            rows={
              report.map((r) => ({
                name: r.emp.name,
                position: r.emp.position ?? "",
                brand: brandName(r.emp.brand_id),
                worked: r.worked,
                absent: r.absent,
                vacation: r.vacation,
                late: r.late,
                deductions: r.deductions,
                bonuses: r.bonuses,
                rate: r.attendanceRate,
                rating: r.rating.label,
              })) as unknown as Array<Record<string, unknown>>
            }
            columns={[
              { key: "name", label: "الموظف" },
              { key: "position", label: "الوظيفة" },
              { key: "brand", label: "البراند" },
              { key: "worked", label: "أيام عمل" },
              { key: "absent", label: "غياب" },
              { key: "vacation", label: "إجازات" },
              { key: "late", label: "تأخيرات" },
              { key: "deductions", label: "خصومات" },
              { key: "bonuses", label: "مكافآت" },
              {
                key: "rate",
                label: "نسبة الانتظام %",
                fmt: (v) => `${((Number(v) || 0) * 100).toFixed(1)}%`,
              },
              { key: "rating", label: "التقييم" },
            ]}
          />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi label={T("عدد الموظفين", "Number of employees")} value={employees.length} />
        <Kpi
          label={T("أيام غياب", "Absence days")}
          value={totals.absent}
          color="text-destructive"
        />
        <Kpi
          label={T("أيام إجازات", "Vacation days")}
          value={totals.vacation}
          color="text-blue-500"
        />
        <Kpi label={T("تأخيرات", "Lateness")} value={totals.late} color="text-amber-500" />
        <Kpi
          label={T("صافي مكافآت − خصومات", "Net bonuses − deductions")}
          value={(totals.bonuses - totals.deductions).toLocaleString("en-US")}
          color={totals.bonuses - totals.deductions >= 0 ? "text-emerald-500" : "text-destructive"}
        />
      </div>

      <Tabs defaultValue="report">
        <TabsList>
          <TabsTrigger value="report">
            {T("تقرير الأداء (تلقائي)", "Performance report (automatic)")}
          </TabsTrigger>
          <TabsTrigger value="employees">
            <Users className="w-4 h-4 ml-1" /> {T("الموظفون", "Employees")}
          </TabsTrigger>
        </TabsList>

        {/* REPORT (auto-computed) */}
        <TabsContent value="report" className="space-y-4 mt-4">
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold flex items-center justify-between gap-2 flex-wrap">
              <span>
                {T(
                  `تقرير أداء ${MONTHS[month - 1]} ${year} — محسوب تلقائياً`,
                  `${MONTHS[month - 1]} ${year} performance report — computed automatically`,
                )}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  onClick={() =>
                    qc.invalidateQueries({ queryKey: ["attendance-computed", year, month] })
                  }
                >
                  <RefreshCw className="w-3 h-3" /> {T("تحديث", "Refresh")}
                </Button>
                {canWrite && (
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={approveMonth.isPending}
                    onClick={() => approveMonth.mutate()}
                  >
                    <CheckCircle2 className="w-4 h-4" />{" "}
                    {T("اعتماد ومزامنة مع المرتبات", "Approve and sync with payroll")}
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الموظف", "Employee")}</th>
                    <th className="p-3">{T("البراند", "Brand")}</th>
                    <th className="p-3 text-center">{T("أيام العمل", "Work days")}</th>
                    <th className="p-3 text-center">{T("أيام حضور", "Days present")}</th>
                    <th className="p-3 text-center">{T("غياب", "Absent")}</th>
                    <th className="p-3 text-center">{T("إجازات", "Vacation")}</th>
                    <th className="p-3 text-center">{T("تأخيرات", "Lateness")}</th>
                    <th className="p-3 text-center">{T("دقائق تأخير", "Late minutes")}</th>
                    <th className="p-3 text-center">{T("دقائق أوفر تايم", "Overtime minutes")}</th>
                    <th className="p-3 text-center">{T("خصومات", "Deductions")}</th>
                    <th className="p-3 text-center">{T("مكافآت", "Bonuses")}</th>
                    <th className="p-3 text-center">{T("الانتظام", "Attendance rate")}</th>
                    <th className="p-3 text-center">{T("التقييم", "Rating")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r) => (
                    <tr key={r.emp.id} className="border-b border-border/50">
                      <td className="p-3 font-medium">
                        {r.emp.name}{" "}
                        {r.emp.position && (
                          <span className="text-xs text-muted-foreground">· {r.emp.position}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{brandName(r.emp.brand_id)}</td>
                      <td className="p-3 text-center">{r.working}</td>
                      <td className="p-3 text-center">{r.worked}</td>
                      <td className="p-3 text-center text-destructive">{r.absent}</td>
                      <td className="p-3 text-center text-blue-500">{r.vacation}</td>
                      <td className="p-3 text-center text-amber-500">{r.late}</td>
                      <td className="p-3 text-center text-amber-500 num">{r.lateMin}</td>
                      <td className="p-3 text-center text-emerald-500 num">{r.otMin}</td>
                      <td className="p-3 text-center num text-destructive">
                        {r.deductions.toLocaleString("en-US")}
                      </td>
                      <td className="p-3 text-center num text-emerald-500">
                        {r.bonuses.toLocaleString("en-US")}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {(r.attendanceRate * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="secondary" className={r.rating.cls}>
                          {r.rating.label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {report.length === 0 && (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-muted-foreground">
                        {T("لا بيانات.", "No data.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground p-3 border-t border-border">
              {T(
                "* محسوب تلقائياً من الحضور والانصراف · الغياب = أيام العمل − (حضور + إجازات) · خصم التأخير = دقائق × سعر الساعة ÷ 60 · مكافأة الأوفر تايم = دقائق × سعر الساعة ÷ 60 · خصم الغياب = مرتب/أيام العمل × عدد أيام الغياب.",
                "* Computed automatically from check-in/check-out · Absence = work days − (present + vacation) · Lateness deduction = minutes × hourly rate ÷ 60 · Overtime bonus = minutes × hourly rate ÷ 60 · Absence deduction = salary/work days × number of absence days.",
              )}
            </p>
          </Card>
        </TabsContent>

        {/* EMPLOYEES */}
        <TabsContent value="employees" className="space-y-4 mt-4">
          {canWrite && (
            <Card className="card-gradient p-5">
              <h3 className="font-semibold mb-3">{T("إضافة موظف", "Add employee")}</h3>
              <div className="grid md:grid-cols-5 gap-3">
                <div>
                  <Label>{T("الاسم *", "Name *")}</Label>
                  <Input
                    value={newEmp.name}
                    onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{T("البراند *", "Brand *")}</Label>
                  <Select
                    value={newEmp.brand_id}
                    onValueChange={(v) => setNewEmp({ ...newEmp, brand_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={T("اختر", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{T("الوظيفة", "Position")}</Label>
                  <Input
                    value={newEmp.position}
                    onChange={(e) => setNewEmp({ ...newEmp, position: e.target.value })}
                    placeholder={T("محاسب / مندوب / تحضير...", "Accountant / rep / prep...")}
                  />
                </div>
                <div>
                  <Label>{T("المرتب الشهري *", "Monthly salary *")}</Label>
                  <Input
                    type="number"
                    dir="ltr"
                    className="text-left"
                    value={newEmp.salary}
                    onChange={(e) =>
                      setNewEmp({ ...newEmp, salary: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => {
                      if (!newEmp.name.trim())
                        return toast.error(T("أدخل الاسم", "Enter the name"));
                      if (!newEmp.brand_id)
                        return toast.error(T("اختر البراند", "Select the brand"));
                      if (newEmp.salary <= 0)
                        return toast.error(T("أدخل المرتب", "Enter the salary"));
                      saveEmp.mutate({
                        name: newEmp.name.trim(),
                        brand_id: newEmp.brand_id,
                        position: newEmp.position || null,
                        salary: newEmp.salary,
                        active: true,
                      });
                    }}
                    className="gap-2 w-full"
                  >
                    <Plus className="w-4 h-4" /> {T("إضافة", "Add")}
                  </Button>
                </div>
              </div>
            </Card>
          )}
          <Card className="card-gradient overflow-hidden">
            <div className="p-4 border-b border-border font-semibold">
              {T(`قائمة الموظفين (${employees.length})`, `Employee list (${employees.length})`)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-right border-b border-border">
                    <th className="p-3">{T("الاسم", "Name")}</th>
                    <th className="p-3">{T("الوظيفة", "Position")}</th>
                    <th className="p-3">{T("البراند", "Brand")}</th>
                    <th className="p-3 text-center">{T("المرتب", "Salary")}</th>
                    <th className="p-3">{T("الحالة", "Status")}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e) => (
                    <tr key={e.id} className="border-b border-border/50">
                      <td className="p-3 font-medium">{e.name}</td>
                      <td className="p-3 text-muted-foreground">{e.position ?? "—"}</td>
                      <td className="p-3">{brandName(e.brand_id)}</td>
                      <td className="p-3 text-center num">
                        {Number(e.salary || 0).toLocaleString("en-US")}
                      </td>
                      <td className="p-3">
                        {e.active ? (
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-500">
                            {T("نشط", "Active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{T("موقوف", "Disabled")}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-left flex gap-1 justify-end">
                        {canWrite && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                saveEmp.mutate({
                                  id: e.id,
                                  name: e.name,
                                  brand_id: e.brand_id,
                                  salary: e.salary,
                                  position: e.position,
                                  active: !e.active,
                                  note: e.note,
                                })
                              }
                            >
                              {e.active ? T("إيقاف", "Disable") : T("تفعيل", "Activate")}
                            </Button>
                            <ConfirmDelete
                              onConfirm={() => delEmp.mutate(e.id)}
                              title={T("حذف الموظف؟", "Delete employee?")}
                              desc={T(
                                "سيتم حذف الموظف وكل بيانات أدائه المسجلة. لا يمكن التراجع.",
                                "This will delete the employee and all their recorded performance data. This cannot be undone.",
                              )}
                            />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        {T("لا يوجد موظفون بعد.", "No employees yet.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConfirmDelete({
  onConfirm,
  title,
  desc,
}: {
  onConfirm: () => void;
  title?: string;
  desc?: string;
}) {
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
          <AlertDialogTitle>{title ?? T("تأكيد الحذف", "Confirm delete")}</AlertDialogTitle>
          <AlertDialogDescription>
            {desc ?? T("لا يمكن التراجع.", "This cannot be undone.")}
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
