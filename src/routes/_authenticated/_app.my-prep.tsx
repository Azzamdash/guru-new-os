import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";
import {
  getMyPrepPipeline,
  updateInvoiceStage,
  STAGES,
  type Stage,
} from "@/lib/operations.functions";
import { useLang, tr } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/_app/my-prep")({
  head: () => ({
    meta: [
      { title: tr("أوردراتي — تحضير — e-GURUS") },
      { name: "description", content: "الأوردرات المُسندة إليّ فقط عبر خط تجهيز الأوردرات." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MyPrepPage,
});

const STAGE_ORDER: Stage[] = ["new", "processing", "packing", "ready_to_ship", "with_courier"];

function MyPrepPage() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const getFn = useServerFn(getMyPrepPipeline);
  const updFn = useServerFn(updateInvoiceStage);
  const dataQ = useQuery({ queryKey: ["my-prep"], queryFn: () => getFn(), refetchInterval: 20000 });
  const advance = useMutation({
    mutationFn: (v: { id: string; stage: Stage }) => updFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-prep"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = dataQ.data;
  const AR = lang === "ar";
  const NextIcon = AR ? ChevronLeft : ChevronRight;
  const PrevIcon = AR ? ChevronRight : ChevronLeft;

  const nextStage = (s: Stage): Stage | null => {
    const i = STAGE_ORDER.indexOf(s);
    if (i < 0) return null;
    return STAGE_ORDER[i + 1] ?? "delivered";
  };
  const prevStage = (s: Stage): Stage | null => {
    const i = STAGE_ORDER.indexOf(s);
    return i <= 0 ? null : STAGE_ORDER[i - 1];
  };

  const stageLabel: Record<Stage, { ar: string; en: string }> = {
    new: { ar: "أوردر جديد", en: "New" },
    processing: { ar: "قيد التجهيز", en: "Processing" },
    packing: { ar: "التعبئة", en: "Packing" },
    ready_to_ship: { ar: "جاهز للشحن", en: "Ready to ship" },
    with_courier: { ar: "مع المندوب", en: "With courier" },
    delivered: { ar: "تم التسليم", en: "Delivered" },
    cancelled: { ar: "ملغي", en: "Cancelled" },
  };
  const L = (s: Stage) => (AR ? stageLabel[s].ar : stageLabel[s].en);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Activity className="w-7 h-7 text-primary" />{" "}
          {AR ? tr("أوردراتي — التحضير") : "My prep orders"}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {AR
            ? tr("الأوردرات المُسندة إليك فقط. حرّك كل أوردر بين المراحل حتى التسليم.")
            : "Only orders assigned to you. Move each order through the stages."}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label={AR ? tr("المُسند إليّ") : "Assigned to me"}
          value={String(d?.kpis.totalAssigned ?? 0)}
        />
        <Kpi
          label={AR ? tr("متأخر عن الـ SLA") : "SLA breached"}
          value={String(d?.kpis.breachedCount ?? 0)}
          tone="danger"
        />
      </div>

      <Card className="card-gradient p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {(d?.pipeline ?? []).map((col) => (
            <div
              key={col.stage}
              className="rounded-lg border border-border/60 bg-muted/20 p-3 flex flex-col min-h-[220px]"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm font-semibold">{L(col.stage as Stage)}</div>
                <div
                  className={`text-xl font-bold num ${col.breached > 0 ? "text-destructive" : ""}`}
                >
                  {col.count}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground mb-3">
                {col.slaHours !== null
                  ? `SLA: ${col.slaHours < 1 ? `${col.slaHours * 60}m` : `${col.slaHours}h`}`
                  : "—"}
                {col.breached > 0 && (
                  <span className="text-destructive font-semibold ms-2">
                    · {col.breached} {AR ? tr("متأخر") : "late"}
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-1.5">
                {col.items.map((it) => (
                  <div
                    key={it.id}
                    className={`rounded border p-2 text-xs flex items-center justify-between gap-1 ${it.breached ? "border-destructive/60 bg-destructive/10" : "border-border/50 bg-background/60"}`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-muted-foreground">{it.code}</div>
                      <div className="truncate font-medium">{it.customer ?? it.brandName}</div>
                      {it.customerPhone && (
                        <div className="text-[10px] text-muted-foreground" dir="ltr">
                          {it.customerPhone}
                        </div>
                      )}
                      <div
                        className={`text-[10px] ${it.breached ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                      >
                        {it.hoursIn < 1
                          ? `${Math.round(it.hoursIn * 60)}m`
                          : `${it.hoursIn.toFixed(1)}h`}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {prevStage(col.stage as Stage) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() =>
                            advance.mutate({ id: it.id, stage: prevStage(col.stage as Stage)! })
                          }
                          title={AR ? tr("رجوع") : "Back"}
                        >
                          <PrevIcon className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {nextStage(col.stage as Stage) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() =>
                            advance.mutate({ id: it.id, stage: nextStage(col.stage as Stage)! })
                          }
                          title={AR ? tr("التالي") : "Next"}
                        >
                          <NextIcon className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {col.items.length === 0 && (
                  <div className="text-[11px] text-muted-foreground text-center py-6">—</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {(d?.kpis.totalAssigned ?? 0) === 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {AR
              ? tr("لا توجد أوردرات مُسندة إليك حاليًا.")
              : "No orders assigned to you right now."}
          </div>
        )}
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <Card className="card-gradient p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-3xl font-bold mt-1 num ${tone === "danger" ? "text-destructive" : ""}`}>
        {value}
      </div>
    </Card>
  );
}
