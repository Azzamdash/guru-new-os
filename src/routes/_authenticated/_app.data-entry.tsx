import { getTodayInBusinessTimezone } from "@/lib/timezone";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  listBrands, getMonthlyEntry, upsertMonthlyEntry,
} from "@/lib/internal.functions";
import { getMyRole } from "@/lib/admin.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/data-entry")({
  head: () => ({ meta: [{ title: "إدخال البيانات — e-GURUS" }] }),
  component: DataEntryPage,
});

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

type PeriodType = "daily"|"weekly"|"monthly"|"yearly"|"custom";

function DataEntryPage() {
  const qc = useQueryClient();
  const listBrandsFn = useServerFn(listBrands);
  const getEntryFn = useServerFn(getMonthlyEntry);
  const upsertEntryFn = useServerFn(upsertMonthlyEntry);
  const getRoleFn = useServerFn(getMyRole);

  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canWrite = !!roleQ.data && roleQ.data.roles.some((r) => ["admin","manager","data_entry","accountant"].includes(r));

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });

  const now = new Date();
  const [brandId, setBrandId] = useState<string>("");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [periodDate, setPeriodDate] = useState<string>(getTodayInBusinessTimezone());
  const [periodEndDate, setPeriodEndDate] = useState<string>(getTodayInBusinessTimezone());

  useEffect(() => { if (!brandId && brandsQ.data?.[0]) setBrandId(brandsQ.data[0].id); }, [brandsQ.data, brandId]);

  const usesDate = periodType === "daily" || periodType === "weekly" || periodType === "custom";
  const effectiveMonth = useMemo(() => {
    if (usesDate) return new Date(periodDate).getMonth() + 1;
    if (periodType === "yearly") return 12;
    return month;
  }, [usesDate, periodType, periodDate, month]);
  const effectiveYear = useMemo(() => usesDate ? new Date(periodDate).getFullYear() : year, [usesDate, periodDate, year]);

  const scope = {
    brandId, year: effectiveYear, month: effectiveMonth,
    period_type: periodType,
    period_date: usesDate ? periodDate : null,
    period_end_date: periodType === "custom" ? periodEndDate : null,
  };
  const scopeKey = ["monthly-entry", brandId, effectiveYear, effectiveMonth, periodType, periodDate, periodEndDate];

  const entryQ = useQuery({ queryKey: scopeKey, queryFn: () => getEntryFn({ data: scope }), enabled: !!brandId });

  const currentBrand = (brandsQ.data ?? []).find((b) => b.id === brandId);
  const isService = currentBrand?.type === "service";

  const [form, setForm] = useState({
    revenue: 0, cash_position: 0,
    orders_total: 0, orders_confirmed: 0, orders_delivered: 0, orders_returned: 0,
    service_clients: 0, service_projects: 0, note: "",
  });

  useEffect(() => {
    const e = entryQ.data;
    setForm({
      revenue: Number(e?.revenue) || 0,
      cash_position: Number(e?.cash_position) || 0,
      orders_total: Number(e?.orders_total) || 0,
      orders_confirmed: Number(e?.orders_confirmed) || 0,
      orders_delivered: Number(e?.orders_delivered) || 0,
      orders_returned: Number(e?.orders_returned) || 0,
      service_clients: Number(e?.service_clients) || 0,
      service_projects: Number(e?.service_projects) || 0,
      note: e?.note ?? "",
    });
  }, [entryQ.data, brandId, effectiveYear, effectiveMonth, periodType, periodDate]);

  const saveMut = useMutation({
    mutationFn: () => upsertEntryFn({ data: { brand_id: brandId, year: effectiveYear, month: effectiveMonth, period_type: periodType, period_date: usesDate ? periodDate : null, period_end_date: periodType === "custom" ? periodEndDate : null, ...form } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: scopeKey });
      qc.invalidateQueries({ queryKey: ["internal-dashboard"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });



  if (!canWrite) {
    return (
      <div className="p-10 max-w-2xl mx-auto">
        <Card className="p-8 text-center card-gradient">
          <Lock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-xl font-bold mb-1">لا تملك صلاحية الإدخال</h2>
          <p className="text-sm text-muted-foreground">تواصل مع المشرف.</p>
        </Card>
      </div>
    );
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">إدخال البيانات</h1>
        <p className="text-muted-foreground text-sm mt-1">يومي، أسبوعي، شهري، سنوي، أو مدة محددة — لكل براند.</p>
      </div>

      <Card className="card-gradient p-5 space-y-4">
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <Label>البراند</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {(brandsQ.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} {b.type === "service" ? "· خدمات" : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>نوع الفترة</Label>
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
                <SelectItem value="yearly">سنوي</SelectItem>
                <SelectItem value="custom">مدة محددة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodType === "daily" && (
            <div className="md:col-span-2">
              <Label>التاريخ</Label>
              <Input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
            </div>
          )}
          {periodType === "weekly" && (
            <div className="md:col-span-2">
              <Label>بداية الأسبوع</Label>
              <Input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
            </div>
          )}
          {periodType === "custom" && (
            <>
              <div>
                <Label>من</Label>
                <Input type="date" value={periodDate} onChange={(e) => setPeriodDate(e.target.value)} />
              </div>
              <div>
                <Label>إلى</Label>
                <Input type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
              </div>
            </>
          )}
          {(periodType === "monthly" || periodType === "yearly") && (
            <>
              <div>
                <Label>السنة</Label>
                <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v, 10))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {periodType === "monthly" && (
                <div>
                  <Label>الشهر</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v, 10))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {brandId && (
        <>
          <Card className="card-gradient p-5 space-y-4">
            <h3 className="font-semibold">البيانات المالية</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <NumField label="الإيرادات" value={form.revenue} onChange={(v) => setForm({ ...form, revenue: v })} />
              <NumField label="المركز النقدي" value={form.cash_position} onChange={(v) => setForm({ ...form, cash_position: v })} />
            </div>
            {!isService && (
              <>
                <h3 className="font-semibold pt-2">البيانات التشغيلية</h3>
                <div className="grid md:grid-cols-4 gap-3">
                  <NumField label="إجمالي الطلبات" value={form.orders_total} onChange={(v) => setForm({ ...form, orders_total: v })} />
                  <NumField label="طلبات مؤكدة" value={form.orders_confirmed} onChange={(v) => setForm({ ...form, orders_confirmed: v })} />
                  <NumField label="طلبات مسلّمة" value={form.orders_delivered} onChange={(v) => setForm({ ...form, orders_delivered: v })} />
                  <NumField label="طلبات مرتجعة" value={form.orders_returned} onChange={(v) => setForm({ ...form, orders_returned: v })} />
                </div>
              </>
            )}
            {isService && (
              <>
                <h3 className="font-semibold pt-2">بيانات الخدمات</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <NumField label="عدد العملاء" value={form.service_clients} onChange={(v) => setForm({ ...form, service_clients: v })} />
                  <NumField label="عدد المشروعات" value={form.service_projects} onChange={(v) => setForm({ ...form, service_projects: v })} />
                </div>
              </>
            )}
            <div>
              <Label>ملاحظات</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
              <Save className="w-4 h-4" /> {saveMut.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" inputMode="decimal" value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        dir="ltr" className="text-left" />
    </div>
  );
}
