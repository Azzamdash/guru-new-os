import { tr } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Truck, Wand2, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import {
  getDistributionBoard,
  assignOrdersCourier,
  assignOrdersEmployee,
  autoAssignOrders,
  autoAssignOrdersToStaff,
  listAssignmentLog,
} from "@/lib/distribution.functions";

export const Route = createFileRoute("/_authenticated/_app/order-distribution")({
  head: () => ({
    meta: [
      { title: "إدارة توزيع الأوردرات — e-GURUS" },
      {
        name: "description",
        content: "توزيع الأوردرات على شركات الشحن والمناديب مع اقتراح تلقائي حسب المحافظة وحمل كل شركة.",
      },
      { property: "og:title", content: "إدارة توزيع الأوردرات — e-GURUS" },
      { property: "og:description", content: "توزيع الأوردرات تلقائياً ويدوياً ومتابعة أحمال شركات الشحن." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderDistributionPage,
});

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} ج`;

function OrderDistributionPage() {
  const qc = useQueryClient();
  const brandsFn = useServerFn(listBrands);
  const boardFn = useServerFn(getDistributionBoard);
  const assignCourierFn = useServerFn(assignOrdersCourier);
  const assignEmployeeFn = useServerFn(assignOrdersEmployee);
  const autoAssignFn = useServerFn(autoAssignOrders);
  const autoStaffToFn = useServerFn(autoAssignOrdersToStaff);
  const logFn = useServerFn(listAssignmentLog);
  const logQ = useQuery({
    queryKey: ["assignment-log"],
    queryFn: () => logFn({ data: { limit: 200 } }),
    staleTime: 30_000,
  });

  const [brandId, setBrandId] = useState<string>("all");
  const [governorate, setGovernorate] = useState<string>("all");
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [courierPick, setCourierPick] = useState<string>("");
  const [employeePick, setEmployeePick] = useState<string>("");

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });

  const params = {
    brandId: brandId === "all" ? null : brandId,
    governorate: governorate === "all" ? null : governorate,
    onlyUnassigned,
    search: search.trim() || null,
  };

  const boardQ = useQuery({
    queryKey: ["distribution-board", params],
    queryFn: () => boardFn({ data: params }),
    staleTime: 30_000,
  });

  const board = boardQ.data;
  const queue = board?.queue ?? [];

  const invalidate = () => {
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ["distribution-board"] });
    qc.invalidateQueries({ queryKey: ["assignment-log"] });
  };

  const courierM = useMutation({
    mutationFn: (courierId: string | null) =>
      assignCourierFn({ data: { orderIds: [...selected], courierId } }),
    onSuccess: (r) => {
      toast.success(`تم تعيين شركة الشحن لـ ${r.updated} أوردر`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const employeeM = useMutation({
    mutationFn: (employeeId: string | null) =>
      assignEmployeeFn({ data: { orderIds: [...selected], employeeId } }),
    onSuccess: (r) => {
      toast.success(`تم إسناد ${r.updated} أوردر للموظف`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoM = useMutation({
    mutationFn: () => {
      const pool = queue.filter(
        (o) => !o.courierId && o.suggestedCourierId && (!selected.size || selected.has(o.id)),
      );
      return autoAssignFn({
        data: {
          assignments: pool.map((o) => ({ orderId: o.id, courierId: o.suggestedCourierId as string })),
        },
      });
    },
    onSuccess: (r) => {
      if (!r.updated && !r.failed) toast.info(tr("لا توجد أوردرات لها اقتراح تلقائي"));
      else toast.success(`تم التوزيع التلقائي: ${r.updated} أوردر${r.failed ? ` — فشل ${r.failed}` : ""}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoStaffTargets = useMemo(
    () =>
      (selected.size ? queue.filter((o) => selected.has(o.id)) : queue.filter((o) => !o.assignedUserId)).map(
        (o) => o.id,
      ),
    [queue, selected],
  );
  const autoTargetCount = autoStaffTargets.length;

  const autoStaffM = useMutation({
    mutationFn: () => autoStaffToFn({ data: { orderIds: autoStaffTargets } }),
    onSuccess: (r) => {
      toast.success(
        `تم توزيع ${r.updated} أوردر بالتساوي على ${r.staffCount} موظف${r.failed ? ` — فشل ${r.failed}` : ""}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allChecked = queue.length > 0 && selected.size === queue.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(queue.map((o) => o.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const suggestedCount = useMemo(
    () => queue.filter((o) => !o.courierId && o.suggestedCourierId).length,
    [queue],
  );


  return (
    <div className="space-y-5 p-4 md:p-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-primary" /> إ{tr("إدارة توزيع الأوردرات")}          </h1>
          <p className="text-sm text-muted-foreground">
            وزّع الأوردرا{tr("وزّع الأوردرات على شركات الشحن والمناديب مع اقتراح تلقائي حسب المحافظة والسعر.")}p>
        </div>
        <Button variant="outline" onClick={() => boardQ.refetch()} disabled={boardQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${boardQ.isFetching ? "animate-spin" : ""}`} /> ت{tr("تحديث")}        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{tr("غير موزّعة")}</p>
          <p className="text-2xl font-bold">{board?.totals.unassigned ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{tr("موزّعة")}</p>
          <p className="text-2xl font-bold">{board?.totals.assigned ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{tr("قيمة الأوردرات المفتوحة")}</p>
          <p className="text-2xl font-bold">{money(board?.totals.openAmount ?? 0)}</p>
        </Card>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">{tr("طابور التوزيع")}</TabsTrigger>
          <TabsTrigger value="loads">{tr("أحمال شركات الشحن")}</TabsTrigger>
          <TabsTrigger value="log">{tr("سجل التوزيع")}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-40">
              <label className="mb-1 block text-xs text-muted-foreground">{tr("البراند")}</label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("كل البراندات")}</SelectItem>
                  {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-xs text-muted-foreground">{tr("المحافظة")}</label>
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{tr("كل المحافظات")}</SelectItem>
                  {(board?.governorates ?? []).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">{tr("بحث")}</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("اسم العميل، الهاتف، رقم الأوردر")}
                maxLength={80}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={onlyUnassigned}
                onCheckedChange={(v) => setOnlyUnassigned(Boolean(v))}
              />
              غير الموزّعة فق{tr("غير الموزّعة فقط")}label>
          </Card>

          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Button onClick={() => autoStaffM.mutate()} disabled={autoStaffM.isPending || !autoTargetCount}>
              <Wand2 className="h-4 w-4" /> ت{tr("توزيع تلقائي على الموظفين (")}autoTargetCount})
            </Button>
            <Button variant="outline" onClick={() => autoM.mutate()} disabled={autoM.isPending || !suggestedCount}>
              <Wand2 className="h-4 w-4" /> ت{tr("توزيع تلقائي لشركات الشحن (")}suggestedCount})
            </Button>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">{tr("شركة الشحن")}</label>
              <Select value={courierPick} onValueChange={setCourierPick}>
                <SelectTrigger><SelectValue placeholder={tr("اختر شركة")} /></SelectTrigger>
                <SelectContent>
                  {(board?.couriers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={!courierPick || !selected.size || courierM.isPending}
              onClick={() => courierM.mutate(courierPick)}
            >
              تعيين للمحدد ({{tr("تعيين للمحدد (")})
            </Button>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">{tr("الموظف (مستخدم النظام)")}</label>
              <Select value={employeePick} onValueChange={setEmployeePick}>
                <SelectTrigger><SelectValue placeholder={tr("اختر مستخدم")} /></SelectTrigger>
                <SelectContent>
                  {(board?.employees ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                      {e.email && e.email !== e.name ? ` — ${e.email}` : ""}
                    </SelectItem>
                  ))}
                  {(board?.employees ?? []).length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">{tr("لا يوجد مستخدمون بصلاحية على هذه الصفحة")}</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              disabled={!employeePick || !selected.size || employeeM.isPending}
              onClick={() => employeeM.mutate(employeePick)}
            >
              <Users className="h-4 w-4" /> إ{tr("إسناد للمحدد")}            </Button>
            <Button
              variant="ghost"
              disabled={!selected.size || courierM.isPending}
              onClick={() => courierM.mutate(null)}
            >
              إلغاء التوزيع
 {tr("إلغاء التوزيع")}Button>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
                  <th className="p-2 text-start">{tr("الأوردر")}</th>
                  <th className="p-2 text-start">{tr("العميل")}</th>
                  <th className="p-2 text-start">{tr("المحافظة")}</th>
                  <th className="p-2 text-start">{tr("القيمة")}</th>
                  <th className="p-2 text-start">{tr("الحالة")}</th>
                  <th className="p-2 text-start">{tr("شركة الشحن")}</th>
                  <th className="p-2 text-start">{tr("الموظف")}</th>
                  <th className="p-2 text-start">{tr("الاقتراح")}</th>
                </tr>
              </thead>
              <tbody>
                {boardQ.isLoading && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{tr("جاري التحميل…")}</td></tr>
                )}
                {!boardQ.isLoading && !queue.length && (
                  <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{tr("لا توجد أوردرات مطابقة")}</td></tr>
                )}
                {queue.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2">
                      <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggleOne(o.id)} />
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{o.orderNumber ?? o.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{o.brandName}</div>
                    </td>
                    <td className="p-2">
                      <div>{o.customerName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{o.customerPhone ?? ""}</div>
                    </td>
                    <td className="p-2">{o.governorate ?? "—"}</td>
                    <td className="p-2">{money(o.total)}</td>
                    <td className="p-2"><Badge variant="secondary">{o.status}</Badge></td>
                    <td className="p-2">{o.courierName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{o.assignedUserName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">
                      {o.suggestedCourierName ? (
                        <span className="text-xs">
                          {o.suggestedCourierName}
                          {o.suggestedFee != null ? ` — ${money(o.suggestedFee)}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{tr("لا يوجد سعر مسجّل")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="loads">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-start">{tr("شركة الشحن")}</th>
                  <th className="p-2 text-start">{tr("مفتوحة")}</th>
                  <th className="p-2 text-start">{tr("قيمة المفتوحة")}</th>
                  <th className="p-2 text-start">{tr("تم التسليم")}</th>
                  <th className="p-2 text-start">{tr("مرتجع")}</th>
                  <th className="p-2 text-start">{tr("نسبة التسليم")}</th>
                  <th className="p-2 text-start">{tr("تغطية المحافظات")}</th>
                </tr>
              </thead>
              <tbody>
                {(board?.loads ?? []).map((l) => (
                  <tr key={l.courierId} className="border-t">
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2">{l.open}</td>
                    <td className="p-2">{money(l.openAmount)}</td>
                    <td className="p-2">{l.delivered}</td>
                    <td className="p-2">{l.returned}</td>
                    <td className="p-2">{l.deliveryRate.toFixed(1)}%</td>
                    <td className="p-2">{l.governorates}</td>
                  </tr>
                ))}
                {!board?.loads.length && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{tr("لا توجد بيانات")}</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="log">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2 text-start">{tr("التاريخ")}</th>
                  <th className="p-2 text-start">{tr("الأوردر")}</th>
                  <th className="p-2 text-start">{tr("من")}</th>
                  <th className="p-2 text-start">{tr("إلى")}</th>
                  <th className="p-2 text-start">{tr("الطريقة")}</th>
                  <th className="p-2 text-start">{tr("السبب")}</th>
                  <th className="p-2 text-start">{tr("بواسطة")}</th>
                </tr>
              </thead>
              <tbody>
                {(logQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString("en-US")}
                    </td>
                    <td className="p-2">
                      <Link to="/order-view/$id" params={{ id: r.orderId }} className="text-primary hover:underline">
                        #{r.orderNumber ?? r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2">{r.fromName ?? "—"}</td>
                    <td className="p-2 font-medium">{r.toName ?? "إلغاء التوزيع"}</td>
                    <td className="p-2 text-xs">
                      {r.method === "auto" ? "تلقائي" : r.method === "unassign" ? "إلغاء" : "يدوي"}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="p-2 text-xs">{r.byName ?? "—"}</td>
                  </tr>
                ))}
                {(logQ.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      لا توجد عمليات توزيع مس{tr("لا توجد عمليات توزيع مسجّلة بعد")}td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
