import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getInventoryValuation } from "@/lib/inventory-valuation.functions";
import { listBrands } from "@/lib/internal.functions";
import { listOfflineBranches, listBranchStock, listBranchStockMovements } from "@/lib/branch-stock.functions";
import { useLang, tr } from "@/lib/i18n";
import { Layers, AlertTriangle, Store, Package } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();

const searchSchema = z.object({
  brandId: fallback(z.string(), "").default(""),
  branchId: fallback(z.string(), "").default(""),
  year: fallback(z.number().int(), CURRENT_YEAR).default(CURRENT_YEAR),
});

export const Route = createFileRoute("/_authenticated/_app/reports/inventory-valuation")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({ meta: [
    { title: tr("تقارير المخزون — e-GURUS") },
    { name: "description", content: "قيمة المخزون بمتوسط التكلفة المتحرك (WAC) لكل منتج/براند/فرع." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: Page,
});

function Page() {
  const { t, lang } = useLang();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);

  const brandsFn = useServerFn(listBrands);
  const branchesFn = useServerFn(listOfflineBranches);
  const valuationFn = useServerFn(getInventoryValuation);
  const branchStockFn = useServerFn(listBranchStock);
  const branchMovesFn = useServerFn(listBranchStockMovements);

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const branchesQ = useQuery({ queryKey: ["offline-branches"], queryFn: () => branchesFn() });

  const brandId = search.brandId;
  const branchId = search.branchId;
  const year = search.year;
  const scopeId = branchId || brandId;

  // If a branch (offline) is selected we show per-branch stock; else brand/global valuation.
  const branchQ = useQuery({
    queryKey: ["branch-stock", scopeId],
    queryFn: () => branchStockFn({ data: { brandId: scopeId } }),
    enabled: !!branchId,
  });
  const branchMovesQ = useQuery({
    queryKey: ["branch-stock-moves", scopeId],
    queryFn: () => branchMovesFn({ data: { brandId: scopeId, limit: 500 } }),
    enabled: !!branchId,
  });
  const valQ = useQuery({
    queryKey: ["inv-valuation", brandId || "all"],
    queryFn: () => valuationFn({ data: { brandId: brandId || null } }),
    enabled: !branchId,
  });

  const nf = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, ...patch }) });

  const years = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

  // Branch view aggregates
  const branchItems = branchQ.data ?? [];
  const branchMoves = branchMovesQ.data ?? [];
  const movesForYear = branchMoves.filter((m) => new Date(m.occurred_at).getUTCFullYear() === year);
  const branchTotals = branchItems.reduce(
    (a, p) => {
      const qty = Number(p.on_hand_qty || 0);
      const cost = Number(p.moving_avg_cost || 0);
      const price = Number(p.sell_price || 0);
      a.units += qty;
      a.value += qty * cost;
      a.potential_revenue += qty * price;
      return a;
    },
    { units: 0, value: 0, potential_revenue: 0 },
  );
  const branchName = branchesQ.data?.find((b) => b.id === branchId)?.name;
  const brandName = brandsQ.data?.find((b) => b.id === brandId)?.name;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Layers className="w-7 h-7" />
          {L(tr("تقارير المخزون"), "Inventory Reports")}
          {branchName && <span className="text-lg text-muted-foreground">— {branchName}</span>}
          {!branchId && brandName && <span className="text-lg text-muted-foreground">— {brandName}</span>}
          <span className="text-lg text-muted-foreground">· {year}</span>
        </h1>
        {(brandId || branchId) && (
          <Button variant="ghost" size="sm" onClick={() => setSearch({ brandId: "", branchId: "" })}>
            {L(tr("عرض الكل"), "Show all")}
          </Button>
        )}
      </div>

      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Package className="w-3 h-3" /> {L(tr("البراند"), "Brand")}</div>
          <Select value={brandId || "all"} onValueChange={(v) => setSearch({ brandId: v === "all" ? "" : v, branchId: "" })}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("all_brands")}</SelectItem>
              {(brandsQ.data ?? []).filter((b) => b.active).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Store className="w-3 h-3" /> {L(tr("الفرع الأوفلاين"), "Offline branch")}</div>
          <Select value={branchId || "none"} onValueChange={(v) => setSearch({ branchId: v === "none" ? "" : v, brandId: "" })}>
            <SelectTrigger className="w-56"><SelectValue placeholder={L(tr("اختر فرع"), "Select branch")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{L(tr("— بدون فرع —"), "— No branch —")}</SelectItem>
              {(branchesQ.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">{L(tr("السنة"), "Year")}</div>
          <Select value={String(year)} onValueChange={(v) => setSearch({ year: Number(v) })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground ms-auto">
          {L(tr("تُحدَّث تلقائيًا مع كل حركة مخزون."), "Auto-updated on every stock movement.")}
        </span>
      </Card>

      {branchId ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Kpi label={L(tr("عدد المنتجات"), "Products")} value={nf(branchItems.length)} />
            <Kpi label={L(tr("عدد الوحدات"), "Units on hand")} value={nf(branchTotals.units)} />
            <Kpi label={L(tr("قيمة المخزون"), "Inventory Value")} value={nf(branchTotals.value)} />
            <Kpi label={L(tr("الإيراد المحتمل"), "Potential Revenue")} value={nf(branchTotals.potential_revenue)} tone="text-emerald-500" />
          </div>

          <Card className="card-gradient p-5">
            <h3 className="font-semibold mb-3">{L(tr("منتجات الفرع"), "Branch Products")}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{L(tr("المنتج"), "Product")}</th>
                  <th className="p-2 text-start">SKU</th>
                  <th className="p-2 text-end">{L(tr("الرصيد"), "Qty")}</th>
                  <th className="p-2 text-end">{L(tr("متوسط التكلفة"), "Avg Cost")}</th>
                  <th className="p-2 text-end">{L(tr("قيمة المخزون"), "Inv. Value")}</th>
                  <th className="p-2 text-end">{L(tr("سعر البيع"), "Sell Price")}</th>
                </tr></thead>
                <tbody>
                  {branchItems.map((p) => {
                    const qty = Number(p.on_hand_qty || 0);
                    const cost = Number(p.moving_avg_cost || 0);
                    return (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="p-2 font-medium">{p.name}</td>
                        <td className="p-2 font-mono text-xs">{p.sku ?? "—"}</td>
                        <td className="p-2 num text-end">{nf(qty)}</td>
                        <td className="p-2 num text-end">{nf(cost)}</td>
                        <td className="p-2 num text-end font-semibold">{nf(qty * cost)}</td>
                        <td className="p-2 num text-end text-muted-foreground">{nf(Number(p.sell_price || 0))}</td>
                      </tr>
                    );
                  })}
                  {branchItems.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{L(tr("لا توجد بيانات"), "No data")}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="card-gradient p-5">
            <h3 className="font-semibold mb-3">
              {L(`حركات المخزون خلال ${year}`, `Stock Movements — ${year}`)}
              <span className="text-xs text-muted-foreground ms-2">({movesForYear.length})</span>
            </h3>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{L(tr("التاريخ"), "Date")}</th>
                  <th className="p-2 text-start">{L(tr("المنتج"), "Product")}</th>
                  <th className="p-2">{L(tr("النوع"), "Type")}</th>
                  <th className="p-2 text-end">{L(tr("الكمية"), "Qty")}</th>
                </tr></thead>
                <tbody>
                  {movesForYear.map((m) => (
                    <tr key={m.id} className="border-b border-border/50">
                      <td className="p-2" dir="ltr">{new Date(m.occurred_at).toLocaleDateString("en-US")}</td>
                      <td className="p-2">{m.product_name}</td>
                      <td className="p-2">{m.type}</td>
                      <td className="p-2 num text-end">{nf(Number(m.qty))}</td>
                    </tr>
                  ))}
                  {movesForYear.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">{L(tr("لا توجد حركات لهذه السنة"), "No movements this year")}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Kpi label={L(tr("عدد الوحدات"), "Units on hand")} value={nf(valQ.data?.totals.units ?? 0)} />
            <Kpi label={L(tr("قيمة المخزون"), "Inventory Value")} value={nf(valQ.data?.totals.value ?? 0)} />
            <Kpi label={L(tr("الإيراد المحتمل"), "Potential Revenue")} value={nf(valQ.data?.totals.potential_revenue ?? 0)} tone="text-emerald-500" />
            <Kpi label={L(tr("الهامش المحتمل"), "Potential Margin")} value={nf(valQ.data?.totals.potential_margin ?? 0)} tone="text-emerald-500" />
          </div>

          <Card className="card-gradient p-5">
            <h3 className="font-semibold mb-3">{L(tr("حسب البراند"), "By Brand")}</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-muted-foreground">
                <th className="p-2 text-start">{L(tr("البراند"), "Brand")}</th>
                <th className="p-2 text-end">{L(tr("الوحدات"), "Units")}</th>
                <th className="p-2 text-end">{L(tr("القيمة"), "Value")}</th>
                <th className="p-2 text-end"></th>
              </tr></thead>
              <tbody>
                {(valQ.data?.byBrand ?? []).map((b) => (
                  <tr key={b.brand_id} className="border-b border-border/50">
                    <td className="p-2 font-medium">{b.brand_name}</td>
                    <td className="p-2 num text-end">{nf(b.units)}</td>
                    <td className="p-2 num text-end">{nf(b.value)}</td>
                    <td className="p-2 text-end">
                      <Link to="/reports/inventory-valuation" search={{ brandId: b.brand_id, branchId: "", year }} className="text-xs text-primary hover:underline">
                        {L(tr("عرض"), "View")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="card-gradient p-5">
            <h3 className="font-semibold mb-3">{L(tr("تفصيل المنتجات"), "Product Detail")}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border text-muted-foreground">
                  <th className="p-2 text-start">{L(tr("المنتج"), "Product")}</th>
                  <th className="p-2 text-start">{L(tr("البراند"), "Brand")}</th>
                  <th className="p-2 text-end">{L(tr("الرصيد"), "Qty")}</th>
                  <th className="p-2 text-end">{L(tr("متوسط التكلفة"), "Avg Cost")}</th>
                  <th className="p-2 text-end">{L(tr("قيمة المخزون"), "Inv. Value")}</th>
                  <th className="p-2 text-end">{L(tr("سعر البيع"), "Sell Price")}</th>
                  <th className="p-2 text-end">{L(tr("الهامش/وحدة"), "Margin/unit")}</th>
                  <th className="p-2 text-center">{L(tr("تنبيه"), "Alert")}</th>
                </tr></thead>
                <tbody>
                  {(valQ.data?.items ?? []).map((i) => (
                    <tr key={i.id} className="border-b border-border/50">
                      <td className="p-2 font-medium">{i.name}{i.sku ? <span className="text-xs text-muted-foreground ms-2">({i.sku})</span> : null}</td>
                      <td className="p-2 text-muted-foreground">{i.brand_name}</td>
                      <td className="p-2 num text-end">{nf(i.on_hand_qty)}</td>
                      <td className="p-2 num text-end">{nf(i.moving_avg_cost)}</td>
                      <td className="p-2 num text-end font-semibold">{nf(i.inventory_value)}</td>
                      <td className="p-2 num text-end text-muted-foreground">{nf(i.sell_price)}</td>
                      <td className="p-2 num text-end text-emerald-500">{nf(i.sell_price - i.moving_avg_cost)}</td>
                      <td className="p-2 text-center">
                        {i.low_stock ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="w-4 h-4" />{L(tr("منخفض"), "Low")}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                  {(valQ.data?.items ?? []).length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">{L(tr("لا توجد بيانات"), "No data")}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 num ${tone ?? ""}`}>{value}</div>
    </Card>
  );
}
