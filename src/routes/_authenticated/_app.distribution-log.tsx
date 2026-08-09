import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { listAssignmentLog } from "@/lib/distribution.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/distribution-log")({
  head: () => ({
    meta: [
      { title: "سجل التوزيع — e-GURUS" },
      {
        name: "description",
        content: "سجل كل عمليات توزيع الأوردرات على شركات الشحن والموظفين.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Page,
});

function Page() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const logFn = useServerFn(listAssignmentLog);
  const logQ = useQuery({
    queryKey: ["assignment-log"],
    queryFn: () => logFn({ data: { limit: 200 } }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Receipt className="h-6 w-6 text-primary" /> {T("سجل التوزيع", "Distribution Log")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {T(
            "سجل كل عمليات توزيع الأوردرات على شركات الشحن والموظفين.",
            "Log of every order distribution action to couriers and employees.",
          )}
        </p>
      </header>

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
                <td className="p-2 font-medium">{r.toName ?? T("إلغاء التوزيع", "Unassigned")}</td>
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
    </div>
  );
}
