import { tr } from "@/lib/i18n";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Boxes, PackageCheck, AlertTriangle, PackageX } from "lucide-react";
import { listStock } from "@/lib/inventory.functions";
import { useLang } from "@/lib/i18n";

const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Boxes;
  tone?: "warn" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-500" : "text-primary";
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
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const listFn = useServerFn(listStock);
  const stockQ = useQuery({
    queryKey: ["inventory-mgmt", "stock"],
    queryFn: () => listFn({ data: {} }),
  });

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
      .sort((a, b) => a.on_hand_qty - a.reorder_point - (b.on_hand_qty - b.reorder_point))
      .slice(0, 10);
  }, [stockQ.data]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{T("نظرة عامة على المخزون", "Inventory Overview")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {T(
            "إجمالي الأصناف وحالتها الحالية عبر كل المنتجات والخامات.",
            "Total items and their current status across all products and materials.",
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={T("إجمالي الأصناف (SKUs)", "Total items (SKUs)")}
          value={nf(items.length)}
          icon={Boxes}
        />
        <Kpi label={T("متوفر", "In stock")} value={nf(inStock)} icon={PackageCheck} />
        <Kpi
          label={T("وشيك على النفاد", "Low stock")}
          value={nf(lowStock)}
          icon={AlertTriangle}
          tone="warn"
        />
        <Kpi
          label={T("نفدت الكمية", "Out of stock")}
          value={nf(outOfStock)}
          icon={PackageX}
          tone="danger"
        />
      </div>

      <Card className="card-gradient overflow-hidden">
        <div className="p-4 border-b border-border font-semibold">
          {T("مقترح إعادة الطلب", "Reorder suggestions")}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-right border-b border-border">
              <th className="p-3">{T("الصنف", "Item")}</th>
              <th className="p-3">{T("البراند", "Brand")}</th>
              <th className="p-3 text-left">{T("الرصيد الحالي", "Current balance")}</th>
              <th className="p-3 text-left">{T("حد إعادة الطلب", "Reorder point")}</th>
              <th className="p-3 text-left">{T("الكمية المقترحة", "Suggested quantity")}</th>
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
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  {T("لا أصناف محتاجة إعادة طلب حاليًا.", "No items currently need reordering.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        {T(
          'الكمية المقترحة هنا تقدير أولي بسيط. لتحليل أدق مبني على معدل الاستهلاك الفعلي وفترة التوريد، راجع تاب "الذكاء".',
          'The suggested quantity here is a simple initial estimate. For a more precise analysis based on actual consumption rate and lead time, see the "Intelligence" tab.',
        )}
      </p>
    </div>
  );
}
