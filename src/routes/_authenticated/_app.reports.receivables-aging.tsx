import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReceivablesAging, type AgingBucket } from "@/lib/receivables.functions";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useLang, tr } from "@/lib/i18n";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/receivables-aging")({
  head: () => ({
    meta: [
      { title: tr("أعمار الذمم المدينة — e-GURUS") },
      { name: "description", content: "أعمار الذمم المدينة حسب البراند والعميل." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReceivablesAgingPage,
});

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

const BUCKET_LABELS: Record<AgingBucket, { ar: string; en: string }> = {
  b0_30: { ar: "0-30 يوم", en: "0-30 days" },
  b31_60: { ar: "31-60 يوم", en: "31-60 days" },
  b61_90: { ar: "61-90 يوم", en: "61-90 days" },
  b90_plus: { ar: "أكثر من 90 يوم", en: "90+ days" },
};

function ReceivablesAgingPage() {
  const { lang } = useLang();
  const fn = useServerFn(getReceivablesAging);
  const q = useQuery({ queryKey: ["receivables-aging"], queryFn: () => fn() });
  const d = q.data;
  const buckets: AgingBucket[] = d?.buckets ?? ["b0_30", "b31_60", "b61_90", "b90_plus"];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Clock className="w-7 h-7 text-primary" />
          {lang === "ar" ? "أعمار الذمم المدينة" : "Receivables Aging"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {lang === "ar"
            ? "تحليل المبالغ المستحقة على العملاء حسب فترة التأخير"
            : "Outstanding customer balances broken down by delay period"}
        </p>
      </div>

      {q.isLoading ? (
        <EmptyState title={lang === "ar" ? "جارِ التحميل..." : "Loading..."} />
      ) : !d || d.rows.length === 0 ? (
        <EmptyState title={lang === "ar" ? "لا توجد ذمم مستحقة" : "No outstanding receivables"} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">{lang === "ar" ? "الإجمالي" : "Grand Total"}</div>
              <div className="text-2xl font-bold mt-1">{fmt(d.grandTotal)}</div>
            </Card>
            {buckets.map((b) => (
              <Card key={b} className="p-4">
                <div className="text-xs text-muted-foreground">
                  {lang === "ar" ? BUCKET_LABELS[b].ar : BUCKET_LABELS[b].en}
                </div>
                <div className="text-2xl font-bold mt-1">{fmt(d.totals[b])}</div>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">{lang === "ar" ? "حسب البراند" : "By Brand"}</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "ar" ? "البراند" : "Brand"}</TableHead>
                    {buckets.map((b) => (
                      <TableHead key={b} className="text-center">
                        {lang === "ar" ? BUCKET_LABELS[b].ar : BUCKET_LABELS[b].en}
                      </TableHead>
                    ))}
                    <TableHead className="text-center">{lang === "ar" ? "الإجمالي" : "Total"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.byBrand.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="font-medium">{g.label}</TableCell>
                      {buckets.map((b) => (
                        <TableCell key={b} className="text-center">{fmt(g.totals[b])}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{fmt(g.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">{lang === "ar" ? "حسب العميل" : "By Customer"}</h2>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "ar" ? "العميل" : "Customer"}</TableHead>
                    {buckets.map((b) => (
                      <TableHead key={b} className="text-center">
                        {lang === "ar" ? BUCKET_LABELS[b].ar : BUCKET_LABELS[b].en}
                      </TableHead>
                    ))}
                    <TableHead className="text-center">{lang === "ar" ? "الإجمالي" : "Total"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.byCustomer.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="font-medium">{g.label}</TableCell>
                      {buckets.map((b) => (
                        <TableCell key={b} className="text-center">{fmt(g.totals[b])}</TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">{fmt(g.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
