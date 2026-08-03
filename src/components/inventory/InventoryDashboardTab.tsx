import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Boxes, PackageCheck, AlertTriangle, PackageX } from "lucide-react";
import { listStock } from "@/lib/inventory.functions";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Boxes; tone?: "warn" | "danger" }) {
  const toneClass = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-primary";
  return (
    <Card className="p-4 space-y-1">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>{label}</span>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
    </Card>
  );
}

export function InventoryDashboardTab() {
  const listFn = useServerFn(listStock);
  const stockQ = useQuery({ queryKey: ["inventory-mgmt", "stock"], queryFn: () => listFn({ data: {} }) });

  const items = stockQ.data?.items ?? [];
  const inStock = items.filter((i) => i.on_hand_qty > 0).length;
  const outOfStock = items.filter((i) => i.on_hand_qty <= 0).length;
  const lowStock = items.filter((i) => i.low_stock).length;

  const suggested = useMemo(() => {
    return (stockQ.data?.items ?? [])
      .filter((i) => i.low_stock)
      .map((i) => ({
        ...i,
        suggested_qty: Math.max(0, Math.round(i.reorder_point * 2 - i.on_hand_qty)),
      }))
      .sort((a, b) => (a.on_hand_qty - a.reorder_point) - (b.on_hand_qty - b.reorder_point))
      .slice(0, 10);
  }, [stockQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">نظرة عامة على المخزون</h2>
        <p className="text-muted-foreground text-sm mt-1">إجمالي الأصناف وحالتها الحالية عبر كل المنتجات والخامات.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="إجمالي الأصناف (SKUs)" value={nf(items.length)} icon={Boxes} />
        <Kpi label="متوفر" value={nf(inStock)} icon={PackageCheck} />
        <Kpi label="وشيك على النفاد" value={nf(lowStock)} icon={AlertTriangle} tone="warn" />
        <Kpi label="نفدت الكمية" value={nf(outOfStock)} icon={PackageX} tone="danger" />
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">مقترح إعادة الطلب</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">الصنف</th>
              <th className="p-3">البراند</th>
              <th className="p-3 text-left">الرصيد الحالي</th>
              <th className="p-3 text-left">حد إعادة الطلب</th>
              <th className="p-3 text-left">الكمية المقترحة</th>
            </tr>
          </thead>
          <tbody>
            {suggested.map((i) => (
              <tr key={i.key} className="border-b border-border/50">
                <td className="p-3 font-medium">{i.name}</td>
                <td className="p-3 text-muted-foreground">{i.brand_name || "—"}</td>
                <td className="p-3 num text-left">{nf(i.on_hand_qty)}</td>
                <td className="p-3 num text-left">{nf(i.reorder_point)}</td>
                <td className="p-3 num text-left font-semibold">{nf(i.suggested_qty)}</td>
              </tr>
            ))}
            {suggested.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا أصناف محتاجة إعادة طلب حاليًا.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        الكمية المقترحة هنا تقدير أولي بسيط. لتحليل أدق مبني على معدل الاستهلاك الفعلي وفترة التوريد، راجع تاب "الذكاء".
      </p>
    </div>
  );
}
