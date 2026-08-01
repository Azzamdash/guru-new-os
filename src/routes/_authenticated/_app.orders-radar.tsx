import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import { getOrdersRadar, saveSlaRule } from "@/lib/orders-ops.functions";

export const Route = createFileRoute("/_authenticated/_app/orders-radar")({
  head: () => ({
    meta: [
      { title: "رادار الأوردرات — تنبيهات SLA والمخاطر — e-GURUS" },
      { name: "description", content: "متابعة الأوردرات المتأخرة عن مدة المرحلة والأوردرات عالية المخاطر قبل الشحن." },
      { property: "og:title", content: "رادار الأوردرات — e-GURUS" },
      { property: "og:description", content: "تنبيهات SLA وكشف الأوردرات المشكوك فيها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersRadarPage,
});

const STAGES = [
  { key: "new", label: "جديد" },
  { key: "confirmation", label: "تأكيد" },
  { key: "preparation", label: "تحضير" },
  { key: "shipping", label: "شحن" },
  { key: "collection", label: "تحصيل" },
];

function OrdersRadarPage() {
  const brandsFn = useServerFn(listBrands);
  const radarFn = useServerFn(getOrdersRadar);
  const saveRuleFn = useServerFn(saveSlaRule);

  const [brandId, setBrandId] = useState("all");
  const [mode, setMode] = useState<"all" | "sla" | "risk">("all");
  const [ruleStage, setRuleStage] = useState("confirmation");
  const [ruleHours, setRuleHours] = useState("24");

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const radarQ = useQuery({
    queryKey: ["orders-radar", brandId, mode],
    queryFn: () => radarFn({ data: { brandId: brandId === "all" ? null : brandId, mode } }),
    staleTime: 60_000,
  });

  const orders = radarQ.data?.orders ?? [];
  const breached = orders.filter((o) => o.sla_breached).length;
  const risky = orders.filter((o) => o.risk_score >= 30).length;

  const saveRule = async () => {
    try {
      await saveRuleFn({ data: { stage: ruleStage, maxHours: Number(ruleHours) } });
      toast.success("تم حفظ قاعدة الـ SLA");
      radarQ.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <AlertTriangle className="h-5 w-5 text-primary" /> رادار الأوردرات
        </h1>
        <Button variant="outline" size="sm" onClick={() => radarQ.refetch()}>
          <RefreshCw className="ml-1 h-4 w-4" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">إجمالي المفتوح</div><div className="text-2xl font-bold">{orders.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">تجاوز SLA</div><div className="text-2xl font-bold text-destructive">{breached}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">مخاطر مرتفعة</div><div className="text-2xl font-bold">{risky}</div></Card>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-44"><SelectValue placeholder="البراند" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل البراندات</SelectItem>
            {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="sla">متأخر عن SLA</SelectItem>
            <SelectItem value="risk">مخاطر فقط</SelectItem>
          </SelectContent>
        </Select>
        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">قاعدة SLA:</span>
          <Select value={ruleStage} onValueChange={setRuleStage}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" value={ruleHours} onChange={(e) => setRuleHours(e.target.value)} className="w-20" />
          <Button size="sm" variant="outline" onClick={saveRule}>حفظ</Button>
        </div>
      </Card>

      <Card className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">الأوردر</th>
              <th className="p-2 text-right">العميل</th>
              <th className="p-2 text-right">المرحلة</th>
              <th className="p-2 text-right">مدة الانتظار</th>
              <th className="p-2 text-right">المخاطر</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2">
                  <Link to="/order-view/$id" params={{ id: o.id }} className="text-primary hover:underline">
                    #{o.number ?? o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="p-2">{o.customer_name ?? "—"} <span className="text-xs text-muted-foreground">{o.governorate ?? ""}</span></td>
                <td className="p-2"><Badge variant="outline">{STAGES.find((s) => s.key === o.stage)?.label ?? o.stage}</Badge></td>
                <td className="p-2">
                  <Badge variant={o.sla_breached ? "destructive" : "secondary"}>
                    {Math.round(o.hours_in_stage)} س{o.sla_hours ? ` / ${o.sla_hours}` : ""}
                  </Badge>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={o.risk_score >= 30 ? "destructive" : "outline"}>{o.risk_score}</Badge>
                    {o.risk_flags.map((f) => <span key={f} className="text-xs text-muted-foreground">{f}</span>)}
                  </div>
                </td>
              </tr>
            ))}
            {!radarQ.isLoading && orders.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد تنبيهات</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
