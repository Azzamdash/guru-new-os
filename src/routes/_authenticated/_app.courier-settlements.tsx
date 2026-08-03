import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Banknote, Upload } from "lucide-react";
import { toast } from "sonner";
import { listBrands } from "@/lib/internal.functions";
import {
  getSettlementLines,
  importSettlement,
  listSettlements,
  postSettlement,
} from "@/lib/orders-ops.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/_app/courier-settlements")({
  head: () => ({
    meta: [
      { title: "كشوف تحصيل شركات الشحن — e-GURUS" },
      {
        name: "description",
        content: "رفع كشف تحصيل شركة الشحن ومطابقته آلياً مع أوردرات النظام وترحيل المحصّل للخزنة.",
      },
      { property: "og:title", content: "كشوف تحصيل شركات الشحن — e-GURUS" },
      { property: "og:description", content: "مطابقة تحصيل الدفع عند الاستلام مع أوردرات النظام." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CourierSettlementsPage,
});

const money = (n: number, currency: string) =>
  `${Math.round(n).toLocaleString("en-US")} ${currency}`;

function CourierSettlementsPage() {
  const { lang } = useLang();
  const T = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const currency = T("ج", "EGP");
  const qc = useQueryClient();
  const brandsFn = useServerFn(listBrands);
  const listFn = useServerFn(listSettlements);
  const importFn = useServerFn(importSettlement);
  const linesFn = useServerFn(getSettlementLines);
  const postFn = useServerFn(postSettlement);

  const [brandId, setBrandId] = useState("");
  const [reference, setReference] = useState("");
  const [csv, setCsv] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [lineFilter, setLineFilter] = useState("all");

  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => brandsFn() });
  const listQ = useQuery({
    queryKey: ["courier-settlements"],
    queryFn: () => listFn({ data: {} }),
    staleTime: 30_000,
  });
  const linesQ = useQuery({
    queryKey: ["settlement-lines", openId, lineFilter],
    queryFn: () => linesFn({ data: { settlementId: openId as string, matchStatus: lineFilter } }),
    enabled: Boolean(openId),
  });

  const importM = useMutation({
    mutationFn: () => importFn({ data: { brandId, reference: reference.trim() || null, csv } }),
    onSuccess: (r) => {
      toast.success(
        T(
          `تم رفع الكشف: ${r.matched} مطابق من ${r.total}`,
          `Statement uploaded: ${r.matched} matched out of ${r.total}`,
        ),
      );
      setCsv("");
      setReference("");
      setOpenId(r.id);
      qc.invalidateQueries({ queryKey: ["courier-settlements"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postM = useMutation({
    mutationFn: (id: string) => postFn({ data: { settlementId: id } }),
    onSuccess: (r) => {
      toast.success(
        T(`تم ترحيل ${r.posted} بند للتحصيل`, `${r.posted} line(s) posted to collections`),
      );
      qc.invalidateQueries({ queryKey: ["courier-settlements"] });
      qc.invalidateQueries({ queryKey: ["settlement-lines"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <Banknote className="h-5 w-5 text-primary" />{" "}
        {T("كشوف تحصيل شركات الشحن", "Courier Settlement Statements")}
      </h1>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={brandId} onValueChange={setBrandId}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={T("اختر البراند", "Select brand")} />
            </SelectTrigger>
            <SelectContent>
              {(brandsQ.data ?? []).map((b: { id: string; name: string }) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={T("رقم الكشف / المرجع", "Statement number / reference")}
            className="w-56"
          />
          <Button
            size="sm"
            disabled={!brandId || !csv.trim() || importM.isPending}
            onClick={() => importM.mutate()}
          >
            <Upload className="ml-1 h-4 w-4" /> {T("رفع ومطابقة", "Upload & Match")}
          </Button>
        </div>
        <Textarea
          dir="ltr"
          rows={6}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={T(
            "الصق بنود الكشف: رقم التتبع, المبلغ, رسوم الشحن\n12345678, 850, 60",
            "Paste statement lines: tracking number, amount, shipping fee\n12345678, 850, 60",
          )}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {T(
            "المطابقة بتتم على رقم تتبع بوسطة أو رقم التتبع اليدوي أو رقم الأوردر. البنود المطابقة فقط هي اللي بتترحّل للتحصيل.",
            "Matching is done using the courier tracking number, the manual tracking number, or the order number. Only matched lines get posted to collections.",
          )}
        </p>
      </Card>

      <div className="space-y-2">
        {(listQ.data ?? []).map((s) => (
          <Card key={s.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{s.reference ?? s.id.slice(0, 8)}</span>
              {s.courier_name && <Badge variant="outline">{s.courier_name}</Badge>}
              <Badge>{s.status === "posted" ? T("مُرحّل", "Posted") : T("مسودة", "Draft")}</Badge>
              <span className="text-sm text-muted-foreground">
                {T(
                  `مطابق ${s.matched_lines}/${s.lines} — معلن ${money(s.declared_total, currency)} — مطابق ${money(s.matched_total, currency)}`,
                  `Matched ${s.matched_lines}/${s.lines} — Declared ${money(s.declared_total, currency)} — Matched ${money(s.matched_total, currency)}`,
                )}
              </span>
              <div className="ms-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                >
                  {openId === s.id
                    ? T("إخفاء البنود", "Hide Lines")
                    : T("عرض البنود", "Show Lines")}
                </Button>
                <Button
                  size="sm"
                  disabled={s.status === "posted" || postM.isPending}
                  onClick={() => postM.mutate(s.id)}
                >
                  {T("ترحيل المطابق", "Post Matched")}
                </Button>
              </div>
            </div>

            {openId === s.id && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <Select value={lineFilter} onValueChange={setLineFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T("كل البنود", "All Lines")}</SelectItem>
                    <SelectItem value="matched">{T("مطابق", "Matched")}</SelectItem>
                    <SelectItem value="amount_mismatch">
                      {T("فرق مبلغ", "Amount Mismatch")}
                    </SelectItem>
                    <SelectItem value="unmatched">{T("غير مطابق", "Unmatched")}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="max-h-96 overflow-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs">
                      <tr>
                        <th className="p-2 text-right">{T("التتبع", "Tracking")}</th>
                        <th className="p-2 text-right">{T("الأوردر", "Order")}</th>
                        <th className="p-2 text-right">{T("الكشف", "Statement")}</th>
                        <th className="p-2 text-right">{T("النظام", "System")}</th>
                        <th className="p-2 text-right">{T("الحالة", "Status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(linesQ.data ?? []).map((l: Record<string, unknown>) => (
                        <tr key={String(l["id"])} className="border-t">
                          <td dir="ltr" className="p-2 text-right font-mono text-xs">
                            {String(l["tracking"] ?? "")}
                          </td>
                          <td className="p-2">
                            {l["order_id"] ? (
                              <Link
                                to="/order-view/$id"
                                params={{ id: String(l["order_id"]) }}
                                className="text-primary hover:underline"
                              >
                                {String(l["order_number"] ?? T("عرض", "View"))}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-2">
                            {money(Number(l["declared_amount"] ?? 0), currency)}
                          </td>
                          <td className="p-2">
                            {money(Number(l["system_amount"] ?? 0), currency)}
                          </td>
                          <td className="p-2">
                            <Badge
                              variant={l["match_status"] === "matched" ? "default" : "destructive"}
                            >
                              {l["match_status"] === "matched"
                                ? T("مطابق", "Matched")
                                : String(l["diff_reason"] ?? l["match_status"])}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        ))}
        {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
          <Card className="p-6 text-center text-muted-foreground">
            {T("لا توجد كشوف بعد", "No statements yet")}
          </Card>
        )}
      </div>
    </div>
  );
}
