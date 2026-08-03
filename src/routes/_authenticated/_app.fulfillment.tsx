import { tr } from "@/lib/i18n";
import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, Users, PackageCheck } from "lucide-react";
import {
  listBrands,
  listFulfillmentEntries,
  upsertFulfillmentEntry,
  deleteFulfillmentEntry,
} from "@/lib/internal.functions";
import { listEmployees } from "@/lib/employees.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/fulfillment")({
  head: () => ({
    meta: [
      { title: "تحضير الأوردرات — e-GURUS" },
      { name: "description", content: "تسجيل عدد الأوردرات التي حضّرها كل موظف يوميًا." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FulfillmentPage,
});

function fmt(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

function FulfillmentPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listFn = useServerFn(listFulfillmentEntries);
  const upsertFn = useServerFn(upsertFulfillmentEntry);
  const delFn = useServerFn(deleteFulfillmentEntry);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const rowsQ = useQuery({
    queryKey: ["fulfillment-entries"],
    queryFn: () => listFn({ data: {} }),
  });
  const listEmpFn = useServerFn(listEmployees);
  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listEmpFn() });

  const [form, setForm] = useState({
    employee_id: "",
    employee_name: "",
    orders_prepared: 0,
    occurred_at: getTodayInBusinessTimezone(),
    brand_id: "" as string | "",
    note: "",
  });

  const saveMut = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          brand_id: form.brand_id || null,
          employee_id: form.employee_id || null,
          employee_name: form.employee_name.trim(),
          orders_prepared: Number(form.orders_prepared) || 0,
          occurred_at: form.occurred_at,
          note: form.note || null,
        },
      }),
    onSuccess: () => {
      toast.success(T("تم الحفظ", "Saved"));
      setForm({ ...form, employee_id: "", employee_name: "", orders_prepared: 0, note: "" });
      qc.invalidateQueries({ queryKey: ["fulfillment-entries"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports-fulfillment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success(T("تم الحذف", "Deleted"));
      qc.invalidateQueries({ queryKey: ["fulfillment-entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = rowsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const employees = (empQ.data ?? []).filter((e) => e.active);
  const brandEmployees = form.brand_id
    ? employees.filter((e) => e.brand_id === form.brand_id)
    : employees;
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <PackageCheck className="w-7 h-7 text-primary" />{" "}
          {T("تحضير الأوردرات", "Order Fulfillment")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {T(
            "سجّل عدد الأوردرات التي حضّرها كل موظف يوميًا.",
            "Record the number of orders prepared by each employee daily.",
          )}
        </p>
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />{" "}
          {T("إضافة/تسجيل تحضير", "Add/Record Fulfillment")}
        </h3>
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <Label>{T("البراند", "Brand")}</Label>
            <Select
              value={form.brand_id || "none"}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  brand_id: v === "none" ? "" : v,
                  employee_id: "",
                  employee_name: "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{T("— بدون —", "— None —")}</SelectItem>
                {brands
                  .filter((b) => b.active)
                  .map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{T("الموظف", "Employee")}</Label>
            <Select
              value={form.employee_id || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  setForm({ ...form, employee_id: "", employee_name: "" });
                  return;
                }
                const emp = employees.find((e) => e.id === v);
                setForm({ ...form, employee_id: v, employee_name: emp?.name ?? "" });
              }}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    form.brand_id
                      ? T("اختر", "Select")
                      : T("اختر البراند أولًا", "Select brand first")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{T("— يدوي —", "— Manual —")}</SelectItem>
                {brandEmployees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.employee_id && (
              <Input
                className="mt-1"
                placeholder={T("أو اكتب اسمًا", "Or type a name")}
                value={form.employee_name}
                onChange={(e) => setForm({ ...form, employee_name: e.target.value })}
              />
            )}
          </div>
          <div>
            <Label>{T("عدد الأوردرات", "Orders Count")}</Label>
            <Input
              type="number"
              value={form.orders_prepared}
              onChange={(e) => setForm({ ...form, orders_prepared: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label>{T("التاريخ", "Date")}</Label>
            <Input
              type="date"
              value={form.occurred_at}
              onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
            />
          </div>
          <div>
            <Label>{T("ملاحظة", "Note")}</Label>
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder={T("اختياري", "Optional")}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={() => saveMut.mutate()}
            disabled={!form.employee_name.trim() || saveMut.isPending}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" /> {T("حفظ", "Save")}
          </Button>
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("أحدث السجلات", "Latest Records")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-muted-foreground">
              <th className="p-3">{T("التاريخ", "Date")}</th>
              <th className="p-3">{T("الموظف", "Employee")}</th>
              <th className="p-3">{T("البراند", "Brand")}</th>
              <th className="p-3">{T("عدد الأوردرات", "Orders Count")}</th>
              <th className="p-3">{T("ملاحظة", "Note")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="p-3">{r.occurred_at}</td>
                <td className="p-3 font-medium">{r.employee_name}</td>
                <td className="p-3 text-muted-foreground">{brandName(r.brand_id)}</td>
                <td className="p-3 font-semibold">{fmt(r.orders_prepared)}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.note || "—"}</td>
                <td className="p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(T("حذف السجل؟", "Delete record?"))) delMut.mutate(r.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {T("لا سجلات بعد.", "No records yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
