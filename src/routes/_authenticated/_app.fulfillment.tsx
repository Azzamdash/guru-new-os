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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Users, PackageCheck } from "lucide-react";
import {
  listBrands, listFulfillmentEntries, upsertFulfillmentEntry, deleteFulfillmentEntry,
} from "@/lib/internal.functions";
import { listEmployees } from "@/lib/employees.functions";

export const Route = createFileRoute("/_authenticated/_app/fulfillment")({
  head: () => ({ meta: [
    { title: "تحضير الأوردرات — e-GURUS" },
    { name: "description", content: "تسجيل عدد الأوردرات التي حضّرها كل موظف يوميًا." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: FulfillmentPage,
});

function fmt(n: number) { return new Intl.NumberFormat("en-US").format(n); }

function FulfillmentPage() {
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const listFn = useServerFn(listFulfillmentEntries);
  const upsertFn = useServerFn(upsertFulfillmentEntry);
  const delFn = useServerFn(deleteFulfillmentEntry);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const rowsQ = useQuery({ queryKey: ["fulfillment-entries"], queryFn: () => listFn({ data: {} }) });
  const listEmpFn = useServerFn(listEmployees);
  const empQ = useQuery({ queryKey: ["employees"], queryFn: () => listEmpFn() });

  const [form, setForm] = useState({
    employee_id: "", employee_name: "", orders_prepared: 0,
    occurred_at: getTodayInBusinessTimezone(),
    brand_id: "" as string | "", note: "",
  });

  const saveMut = useMutation({
    mutationFn: () => upsertFn({ data: {
      brand_id: form.brand_id || null,
      employee_id: form.employee_id || null,
      employee_name: form.employee_name.trim(),
      orders_prepared: Number(form.orders_prepared) || 0,
      occurred_at: form.occurred_at,
      note: form.note || null,
    }}),
    onSuccess: () => {
      toast.success(tr("تم الحفظ"));
      setForm({ ...form, employee_id: "", employee_name: "", orders_prepared: 0, note: "" });
      qc.invalidateQueries({ queryKey: ["fulfillment-entries"] });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
      qc.invalidateQueries({ queryKey: ["reports-fulfillment"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success(tr("تم الحذف")); qc.invalidateQueries({ queryKey: ["fulfillment-entries"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = rowsQ.data ?? [];
  const brands = brandsQ.data ?? [];
  const employees = (empQ.data ?? []).filter((e) => e.active);
  const brandEmployees = form.brand_id ? employees.filter((e) => e.brand_id === form.brand_id) : employees;
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><PackageCheck className="w-7 h-7 text-primary" /> {tr("تحضير الأوردرات")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{tr("سجّل عدد الأوردرات التي حضّرها كل موظف يوميًا.")}</p>
      </div>

      <Card className="card-gradient p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> {tr("إضافة/تسجيل تحضير")}</h3>
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <Label>{tr("البراند")}</Label>
            <Select value={form.brand_id || "none"} onValueChange={(v) => setForm({ ...form, brand_id: v === "none" ? "" : v, employee_id: "", employee_name: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr("— بدون —")}</SelectItem>
                {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{tr("الموظف")}</Label>
            <Select value={form.employee_id || "none"} onValueChange={(v) => {
              if (v === "none") { setForm({ ...form, employee_id: "", employee_name: "" }); return; }
              const emp = employees.find((e) => e.id === v);
              setForm({ ...form, employee_id: v, employee_name: emp?.name ?? "" });
            }}>
              <SelectTrigger><SelectValue placeholder={form.brand_id ? "اختر" : "اختر البراند أولًا"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr("— يدوي —")}</SelectItem>
                {brandEmployees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!form.employee_id && (
              <Input className="mt-1" placeholder={tr("أو اكتب اسمًا")} value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} />
            )}
          </div>
          <div>
            <Label>{tr("عدد الأوردرات")}</Label>
            <Input type="number" value={form.orders_prepared} onChange={(e) => setForm({ ...form, orders_prepared: parseInt(e.target.value) || 0 })} />
          </div>
          <div>
            <Label>{tr("التاريخ")}</Label>
            <Input type="date" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
          </div>
          <div>
            <Label>{tr("ملاحظة")}</Label>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={tr("اختياري")} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={() => saveMut.mutate()} disabled={!form.employee_name.trim() || saveMut.isPending} className="gap-1.5">
            <Plus className="w-4 h-4" /> {tr("حفظ")}
          </Button>
        </div>
      </Card>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">{tr("أحدث السجلات")}</div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-right text-muted-foreground">
            <th className="p-3">{tr("التاريخ")}</th>
            <th className="p-3">{tr("الموظف")}</th>
            <th className="p-3">{tr("البراند")}</th>
            <th className="p-3">{tr("عدد الأوردرات")}</th>
            <th className="p-3">{tr("ملاحظة")}</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50">
                <td className="p-3">{r.occurred_at}</td>
                <td className="p-3 font-medium">{r.employee_name}</td>
                <td className="p-3 text-muted-foreground">{brandName(r.brand_id)}</td>
                <td className="p-3 font-semibold">{fmt(r.orders_prepared)}</td>
                <td className="p-3 text-xs text-muted-foreground">{r.note || "—"}</td>
                <td className="p-3">
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm(tr("حذف السجل؟"))) delMut.mutate(r.id); }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{tr("لا سجلات بعد.")}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
