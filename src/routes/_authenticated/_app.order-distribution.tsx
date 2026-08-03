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
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/order-distribution")({
  head: () => ({
    meta: [
      { title: tr("إدارة توزيع الأوردرات — e-GURUS") },
      {
        name: "description",
        content:
          "توزيع الأوردرات على شركات الشحن والمناديب مع اقتراح تلقائي حسب المحافظة وحمل كل شركة.",
      },
      { property: "og:title", content: "إدارة توزيع الأوردرات — e-GURUS" },
      {
        property: "og:description",
        content: "توزيع الأوردرات تلقائياً ويدوياً ومتابعة أحمال شركات الشحن.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderDistributionPage,
});

function OrderDistributionPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const money = (n: number) =>
    `${Math.round(n).toLocaleString("en-US")} ${lang === "ar" ? "ج" : "EGP"}`;
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
      toast.success(
        T(`تم تعيين شركة الشحن لـ ${r.updated} أوردر`, `Courier assigned to ${r.updated} order(s)`),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const employeeM = useMutation({
    mutationFn: (employeeId: string | null) =>
      assignEmployeeFn({ data: { orderIds: [...selected], employeeId } }),
    onSuccess: (r) => {
      toast.success(
        T(`تم إسناد ${r.updated} أوردر للموظف`, `Assigned ${r.updated} order(s) to employee`),
      );
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
          assignments: pool.map((o) => ({
            orderId: o.id,
            courierId: o.suggestedCourierId as string,
          })),
        },
      });
    },
    onSuccess: (r) => {
      if (!r.updated && !r.failed)
        toast.info(
          T("لا توجد أوردرات لها اقتراح تلقائي", "No orders have an automatic suggestion"),
        );
      else
        toast.success(
          T(
            `تم التوزيع التلقائي: ${r.updated} أوردر${r.failed ? ` — فشل ${r.failed}` : ""}`,
            `Auto-distributed: ${r.updated} order(s)${r.failed ? ` — failed ${r.failed}` : ""}`,
          ),
        );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoStaffTargets = useMemo(
    () =>
      (selected.size
        ? queue.filter((o) => selected.has(o.id))
        : queue.filter((o) => !o.assignedUserId)
      ).map((o) => o.id),
    [queue, selected],
  );
  const autoTargetCount = autoStaffTargets.length;

  const autoStaffM = useMutation({
    mutationFn: () => autoStaffToFn({ data: { orderIds: autoStaffTargets } }),
    onSuccess: (r) => {
      toast.success(
        T(
          `تم توزيع ${r.updated} أوردر بالتساوي على ${r.staffCount} موظف${r.failed ? ` — فشل ${r.failed}` : ""}`,
          `Distributed ${r.updated} order(s) evenly across ${r.staffCount} employee(s)${r.failed ? ` — failed ${r.failed}` : ""}`,
        ),
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allChecked = queue.length > 0 && selected.size === queue.length;
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(queue.map((o) => o.id)));
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
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Truck className="h-6 w-6 text-primary" />{" "}
            {T("إدارة توزيع الأوردرات", "Order Distribution Management")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {T(
              "وزّع الأوردرات على شركات الشحن والمناديب مع اقتراح تلقائي حسب المحافظة والسعر.",
              "Distribute orders to shipping companies and couriers with automatic suggestions based on governorate and price.",
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => boardQ.refetch()} disabled={boardQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${boardQ.isFetching ? "animate-spin" : ""}`} />{" "}
          {T("تحديث", "Refresh")}
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{T("غير موزّعة", "Unassigned")}</p>
          <p className="text-2xl font-bold">{board?.totals.unassigned ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{T("موزّعة", "Assigned")}</p>
          <p className="text-2xl font-bold">{board?.totals.assigned ?? 0}</p>
        </Card>
      </div>

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">{T("طابور التوزيع", "Distribution Queue")}</TabsTrigger>
          <TabsTrigger value="loads">{T("أحمال شركات الشحن", "Courier Loads")}</TabsTrigger>
          <TabsTrigger value="log">{T("سجل التوزيع", "Distribution Log")}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <Card className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-40">
              <label className="mb-1 block text-xs text-muted-foreground">
                {T("البراند", "Brand")}
              </label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T("كل البراندات", "All Brands")}</SelectItem>
                  {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-40">
              <label className="mb-1 block text-xs text-muted-foreground">
                {T("المحافظة", "Governorate")}
              </label>
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T("كل المحافظات", "All Governorates")}</SelectItem>
                  {(board?.governorates ?? []).map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                {T("بحث", "Search")}
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={T(
                  "اسم العميل، الهاتف، رقم الأوردر",
                  "Customer name, phone, order number",
                )}
                maxLength={80}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Checkbox
                checked={onlyUnassigned}
                onCheckedChange={(v) => setOnlyUnassigned(Boolean(v))}
              />
              {T("غير الموزّعة فقط", "Unassigned only")}
            </label>
          </Card>

          <Card className="flex flex-wrap items-end gap-3 p-4">
            <Button
              onClick={() => autoStaffM.mutate()}
              disabled={autoStaffM.isPending || !autoTargetCount}
            >
              <Wand2 className="h-4 w-4" />{" "}
              {T("توزيع تلقائي على الموظفين", "Auto-distribute to employees")} ({autoTargetCount})
            </Button>
            <Button
              variant="outline"
              onClick={() => autoM.mutate()}
              disabled={autoM.isPending || !suggestedCount}
            >
              <Wand2 className="h-4 w-4" />{" "}
              {T("توزيع تلقائي لشركات الشحن", "Auto-distribute to couriers")} ({suggestedCount})
            </Button>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">
                {T("شركة الشحن", "Courier")}
              </label>
              <Select value={courierPick} onValueChange={setCourierPick}>
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر شركة", "Select a courier")} />
                </SelectTrigger>
                <SelectContent>
                  {(board?.couriers ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={!courierPick || !selected.size || courierM.isPending}
              onClick={() => courierM.mutate(courierPick)}
            >
              {T("تعيين للمحدد", "Assign to selected")} ({selected.size})
            </Button>
            <div className="min-w-44">
              <label className="mb-1 block text-xs text-muted-foreground">
                {T("الموظف (مستخدم النظام)", "Employee (system user)")}
              </label>
              <Select value={employeePick} onValueChange={setEmployeePick}>
                <SelectTrigger>
                  <SelectValue placeholder={T("اختر مستخدم", "Select a user")} />
                </SelectTrigger>
                <SelectContent>
                  {(board?.employees ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                      {e.email && e.email !== e.name ? ` — ${e.email}` : ""}
                    </SelectItem>
                  ))}
                  {(board?.employees ?? []).length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">
                      {T(
                        "لا يوجد مستخدمون بصلاحية على هذه الصفحة",
                        "No users have access to this page",
                      )}
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="secondary"
              disabled={!employeePick || !selected.size || employeeM.isPending}
              onClick={() => employeeM.mutate(employeePick)}
            >
              <Users className="h-4 w-4" /> {T("إسناد للمحدد", "Assign to selected")}
            </Button>
            <Button
              variant="ghost"
              disabled={!selected.size || courierM.isPending}
              onClick={() => courierM.mutate(null)}
            >
              {T("إلغاء التوزيع", "Unassign")}
            </Button>
          </Card>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="p-2">
                    <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                  </th>
                  <th className="p-2 text-start">{T("الأوردر", "Order")}</th>
                  <th className="p-2 text-start">{T("العميل", "Customer")}</th>
                  <th className="p-2 text-start">{T("المحافظة", "Governorate")}</th>
                  <th className="p-2 text-start">{T("القيمة", "Value")}</th>
                  <th className="p-2 text-start">{T("الحالة", "Status")}</th>
                  <th className="p-2 text-start">{T("شركة الشحن", "Courier")}</th>
                  <th className="p-2 text-start">{T("الموظف", "Employee")}</th>
                  <th className="p-2 text-start">{T("الاقتراح", "Suggestion")}</th>
                </tr>
              </thead>
              <tbody>
                {boardQ.isLoading && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      {T("جاري التحميل…", "Loading…")}
                    </td>
                  </tr>
                )}
                {!boardQ.isLoading && !queue.length && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      {T("لا توجد أوردرات مطابقة", "No matching orders")}
                    </td>
                  </tr>
                )}
                {queue.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(o.id)}
                        onCheckedChange={() => toggleOne(o.id)}
                      />
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
                    <td className="p-2">
                      <Badge variant="secondary">{o.status}</Badge>
                    </td>
                    <td className="p-2">
                      {o.courierName ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      {o.assignedUserName ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2">
                      {o.suggestedCourierName ? (
                        <span className="text-xs">
                          {o.suggestedCourierName}
                          {o.suggestedFee != null ? ` — ${money(o.suggestedFee)}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {T("لا يوجد سعر مسجّل", "No fee on record")}
                        </span>
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
                  <th className="p-2 text-start">{T("شركة الشحن", "Courier")}</th>
                  <th className="p-2 text-start">{T("مفتوحة", "Open")}</th>
                  <th className="p-2 text-start">{T("تم التسليم", "Delivered")}</th>
                  <th className="p-2 text-start">{T("مرتجع", "Returned")}</th>
                  <th className="p-2 text-start">{T("نسبة التسليم", "Delivery rate")}</th>
                  <th className="p-2 text-start">{T("تغطية المحافظات", "Governorate coverage")}</th>
                </tr>
              </thead>
              <tbody>
                {(board?.loads ?? []).map((l) => (
                  <tr key={l.courierId} className="border-t">
                    <td className="p-2 font-medium">{l.name}</td>
                    <td className="p-2">{l.open}</td>
                    <td className="p-2">{l.delivered}</td>
                    <td className="p-2">{l.returned}</td>
                    <td className="p-2">{l.deliveryRate.toFixed(1)}%</td>
                    <td className="p-2">{l.governorates}</td>
                  </tr>
                ))}
                {!board?.loads.length && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      {T("لا توجد بيانات", "No data")}
                    </td>
                  </tr>
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
                  <th className="p-2 text-start">{T("التاريخ", "Date")}</th>
                  <th className="p-2 text-start">{T("الأوردر", "Order")}</th>
                  <th className="p-2 text-start">{T("من", "From")}</th>
                  <th className="p-2 text-start">{T("إلى", "To")}</th>
                  <th className="p-2 text-start">{T("الطريقة", "Method")}</th>
                  <th className="p-2 text-start">{T("السبب", "Reason")}</th>
                  <th className="p-2 text-start">{T("بواسطة", "By")}</th>
                </tr>
              </thead>
              <tbody>
                {(logQ.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 whitespace-nowrap text-xs">
                      {new Date(r.createdAt).toLocaleString("en-GB")}
                    </td>
                    <td className="p-2">
                      <Link
                        to="/order-view/$id"
                        params={{ id: r.orderId }}
                        className="text-primary hover:underline"
                      >
                        #{r.orderNumber ?? r.orderId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="p-2">{r.fromName ?? "—"}</td>
                    <td className="p-2 font-medium">
                      {r.toName ?? T("إلغاء التوزيع", "Unassigned")}
                    </td>
                    <td className="p-2 text-xs">
                      {r.method === "auto"
                        ? T("تلقائي", "Auto")
                        : r.method === "unassign"
                          ? T("إلغاء", "Unassign")
                          : T("يدوي", "Manual")}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                    <td className="p-2 text-xs">{r.byName ?? "—"}</td>
                  </tr>
                ))}
                {(logQ.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      {T("لا توجد عمليات توزيع مسجّلة بعد", "No distribution actions recorded yet")}
                    </td>
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
