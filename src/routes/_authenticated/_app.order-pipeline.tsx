import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, ChevronRight, ChevronLeft, X, Printer, Timer } from "lucide-react";
import { getOperationsSnapshot, updateInvoiceStage, STAGES, type Stage, assignInvoicePrep, getInvoiceForPrint } from "@/lib/operations.functions";
import { listBrands } from "@/lib/internal.functions";
import { listOrderPrepUsers, getMyRole } from "@/lib/admin.functions";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";

type PrintInvoice = Awaited<ReturnType<typeof getInvoiceForPrint>>;

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function openPrintWindow(inv: PrintInvoice, lang: "ar" | "en") {
  const isAr = lang === "ar";
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const money = (n: number) => `${n.toFixed(2)} ${t("ج.م", "EGP")}`;
  const rows = inv.items.map((i) => `
    <tr>
      <td>${esc(i.name)}${i.sku ? ` <span style="color:#888">(${esc(i.sku)})</span>` : ""}</td>
      <td style="text-align:center">${i.qty}${i.unit ? ` ${esc(i.unit)}` : ""}</td>
      <td style="text-align:end">${money(i.unitPrice)}</td>
      <td style="text-align:end">${money(i.subtotal)}</td>
    </tr>`).join("");
  const html = `<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}"><head>
    <meta charset="utf-8"><title>${esc(inv.code)} — ${t("فاتورة تحضير", "Prep slip")}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;padding:24px;color:#111}
      h1{margin:0 0 4px;font-size:22px}
      .muted{color:#666;font-size:12px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;border:1px solid #ddd;border-radius:8px;padding:12px}
      .grid div b{display:block;font-size:11px;color:#666;margin-bottom:2px;text-transform:uppercase}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border-bottom:1px solid #eee;padding:8px;font-size:13px}
      th{background:#f6f6f6;text-align:${isAr ? "right" : "left"};font-size:11px;text-transform:uppercase;color:#555}
      tfoot td{border-bottom:none;font-weight:600}
      .totals{margin-top:12px;display:flex;justify-content:flex-end}
      .totals table{width:auto;min-width:260px}
      .note{margin-top:16px;padding:10px;background:#fffbe6;border:1px solid #f5e6a8;border-radius:6px;font-size:12px}
      .actions{margin-top:24px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
      .actions button{padding:12px 20px;font-size:15px;border-radius:8px;border:1px solid #111;background:#111;color:#fff;cursor:pointer}
      .actions button.ghost{background:#fff;color:#111}
      @media print{@page{margin:12mm}.actions{display:none}}
    </style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1>${t("فاتورة تحضير أوردر", "Order prep slip")}</h1>
        <div class="muted">${esc(inv.brandName)} · ${new Date(inv.occurredAt).toLocaleString("en-US")}</div>
      </div>
      <div style="text-align:${isAr ? "left" : "right"}">
        <div style="font-size:20px;font-weight:700">${esc(inv.code)}</div>
        <div class="muted">${t("مرحلة", "Stage")}: ${esc(inv.stage)}</div>
      </div>
    </div>
    <div class="grid">
      <div><b>${t("العميل", "Customer")}</b>${esc(inv.customer.name) || "—"}</div>
      <div><b>${t("الهاتف", "Phone")}</b>${esc(inv.customer.phone) || "—"}</div>
      <div><b>${t("المحافظة", "Governorate")}</b>${esc(inv.customer.governorate) || "—"}</div>
      <div><b>${t("شركة الشحن", "Courier")}</b>${esc(inv.courierName) || "—"}</div>
    </div>
    <table>
      <thead><tr>
        <th>${t("المنتج", "Product")}</th>
        <th style="text-align:center">${t("الكمية", "Qty")}</th>
        <th style="text-align:end">${t("السعر", "Unit")}</th>
        <th style="text-align:end">${t("الإجمالي", "Subtotal")}</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:#888">—</td></tr>`}</tbody>
    </table>
    <div class="totals"><table>
      <tr><td>${t("الإجمالي", "Total")}</td><td style="text-align:end">${money(inv.totals.total)}</td></tr>
      <tr><td>${t("المحصل", "Collected")}</td><td style="text-align:end">${money(inv.totals.collected)}</td></tr>
    </table></div>
    ${inv.note ? `<div class="note"><b>${t("ملاحظة", "Note")}:</b> ${esc(inv.note)}</div>` : ""}
    <div class="actions">
      <button onclick="window.print()">${t("طباعة", "Print")}</button>
      <button class="ghost" onclick="window.close()">${t("إغلاق", "Close")}</button>
    </div>
    <script>window.addEventListener("load",()=>setTimeout(()=>{try{window.focus();window.print()}catch(e){}},400))</script>
  </body></html>`;
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  // Try popup first on desktop
  if (!isMobile) {
    const w = window.open("", "_blank", "width=800,height=900");
    if (w) { w.document.open(); w.document.write(html); w.document.close(); return; }
  }
  // Mobile / popup-blocked fallback: hidden iframe attached to current page
  const existing = document.getElementById("__prep_print_frame");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__prep_print_frame";
  iframe.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;background:#fff;z-index:9999";
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  // Provide a top-level close (in case the inline button is inside srcdoc sandbox)
  const closeBtn = document.createElement("button");
  closeBtn.textContent = isAr ? "إغلاق ✕" : "Close ✕";
  closeBtn.style.cssText = "position:fixed;top:12px;inset-inline-end:12px;z-index:10000;padding:8px 14px;background:#111;color:#fff;border:0;border-radius:8px;font-size:14px;cursor:pointer";
  closeBtn.onclick = () => { iframe.remove(); closeBtn.remove(); };
  document.body.appendChild(closeBtn);
  iframe.onload = () => {
    setTimeout(() => { try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignore */ } }, 400);
  };
}

export const Route = createFileRoute("/_authenticated/_app/order-pipeline")({
  head: () => ({ meta: [
    { title: "مهمة تحضير الأوردر — e-GURUS" },
    { name: "description", content: "خط تجهيز الأوردرات — مراحل SLA وإسناد موظفي التحضير." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: OrderPipelinePage,
});

const STAGE_ORDER: Stage[] = ["new", "processing", "packing", "ready_to_ship", "with_courier"];

function OrderPipelinePage() {
  const { lang } = useLang();
  const qc = useQueryClient();
  const getSnap = useServerFn(getOperationsSnapshot);
  const updStage = useServerFn(updateInvoiceStage);
  const listBrandsFn = useServerFn(listBrands);
  const assignFn = useServerFn(assignInvoicePrep);
  const listPrepFn = useServerFn(listOrderPrepUsers);
  const getRoleFn = useServerFn(getMyRole);
  const getPrintFn = useServerFn(getInvoiceForPrint);
  const roleQ = useQuery({ queryKey: ["my-role"], queryFn: () => getRoleFn() });
  const canAssign = !!(roleQ.data?.isAdmin || roleQ.data?.isManager);
  const [brandId, setBrandId] = useState<string>("all");
  const brandsQ = useQuery({ queryKey: ["brands"], queryFn: () => listBrandsFn() });
  const prepUsersQ = useQuery({ queryKey: ["order-prep-users"], queryFn: () => listPrepFn(), enabled: canAssign });
  const snapQ = useQuery({
    queryKey: ["ops-snapshot", brandId],
    queryFn: () => getSnap({ data: { brandId: brandId === "all" ? null : brandId } }),
    refetchInterval: 15000,
  });

  const advance = useMutation({
    mutationFn: (v: { id: string; stage: Stage }) => updStage({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ops-snapshot"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: (v: { id: string; assigneeId: string | null }) => assignFn({ data: v }),
    onSuccess: () => { toast.success(lang === "ar" ? "تم إسناد الأوردر" : "Assigned"); qc.invalidateQueries({ queryKey: ["ops-snapshot"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handlePrint = async (id: string) => {
    try {
      const inv = await getPrintFn({ data: { id } });
      openPrintWindow(inv, lang);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const prepUsers = prepUsersQ.data ?? [];
  const prepLabel = (id: string | null) => id ? (prepUsers.find((u) => u.id === id)?.email ?? id.slice(0, 6)) : (lang === "ar" ? "غير مُسند" : "Unassigned");

  const brands = brandsQ.data ?? [];
  const data = snapQ.data;

  const stageLabel: Record<Stage, { ar: string; en: string }> = {
    new: { ar: "أوردر جديد", en: "New order" },
    processing: { ar: "قيد التجهيز", en: "Processing" },
    packing: { ar: "التعبئة", en: "Packing" },
    ready_to_ship: { ar: "جاهز للشحن", en: "Ready to ship" },
    with_courier: { ar: "مع المندوب", en: "With courier" },
    delivered: { ar: "تم التسليم", en: "Delivered" },
    cancelled: { ar: "ملغي", en: "Cancelled" },
  };
  const L = (s: Stage) => (lang === "ar" ? stageLabel[s].ar : stageLabel[s].en);

  const nextStage = (s: Stage): Stage | null => {
    const i = STAGES.indexOf(s);
    if (i < 0 || i >= STAGE_ORDER.length) return null;
    return STAGE_ORDER[i + 1] ?? "delivered";
  };
  const prevStage = (s: Stage): Stage | null => {
    const i = STAGE_ORDER.indexOf(s);
    if (i <= 0) return null;
    return STAGE_ORDER[i - 1];
  };
  const isRtl = lang === "ar";
  const NextIcon = isRtl ? ChevronLeft : ChevronRight;
  const PrevIcon = isRtl ? ChevronRight : ChevronLeft;

const STAGE_ACCENT: Record<Stage, string> = {
  new: "from-sky-500/25 to-sky-500/0 text-sky-400",
  processing: "from-primary/25 to-primary/0 text-primary",
  packing: "from-amber-500/25 to-amber-500/0 text-amber-400",
  ready_to_ship: "from-violet-500/25 to-violet-500/0 text-violet-400",
  with_courier: "from-emerald-500/25 to-emerald-500/0 text-emerald-400",
  delivered: "from-emerald-500/25 to-emerald-500/0 text-emerald-400",
  cancelled: "from-rose-500/25 to-rose-500/0 text-rose-400",
};

  return (
    <div className="relative p-4 md:p-6 space-y-5">
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-primary/10 blur-[120px] -z-10" />

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 border border-primary/25 text-primary">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-bold">{lang === "ar" ? "مهمة تحضير الأوردر" : "Order prep task"}</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 line-clamp-1">
              {lang === "ar" ? "تابع كل أوردر خطوة بخطوة من الاستلام لحد التسليم." : "Track each order stage by stage."}
            </p>
          </div>
        </div>
        <Select value={brandId} onValueChange={setBrandId}>
          <SelectTrigger className="w-full sm:w-52 h-10 rounded-full bg-card/60 backdrop-blur border-border/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل البراندات" : "All brands"}</SelectItem>
            {brands.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </header>

      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
        <Timer className="w-3.5 h-3.5" />
        <span>{lang === "ar" ? "كل مرحلة ليها SLA — يتلوّن أحمر لو اتأخر" : "Each stage has an SLA — red = breached"}</span>
      </div>

      <div className="-mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto pb-2 snap-x snap-mandatory md:snap-none">
        <div className="flex gap-3 md:gap-4 xl:grid xl:grid-cols-5 min-w-max xl:min-w-0">
          {(data?.pipeline ?? []).map((col) => {
            const accent = STAGE_ACCENT[col.stage as Stage] ?? STAGE_ACCENT.new;
            return (
              <div
                key={col.stage}
                className="snap-start shrink-0 w-[85vw] sm:w-[46vw] md:w-[42vw] lg:w-[30vw] xl:w-auto rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col min-h-[360px]"
              >
                <div className={`px-4 py-3 border-b border-border/40 bg-gradient-to-b ${accent}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm">{L(col.stage as Stage)}</h3>
                    <span className={`text-lg font-extrabold num ${col.breached > 0 ? "text-destructive" : ""}`}>
                      {col.count}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                    <span className="rounded-md bg-background/30 px-1.5 py-0.5 backdrop-blur">
                      SLA: {col.slaHours !== null ? (col.slaHours < 1 ? `${col.slaHours * 60}m` : `${col.slaHours}h`) : "—"}
                    </span>
                    {col.breached > 0 && (
                      <span className="rounded-md bg-destructive/20 text-destructive font-bold px-1.5 py-0.5">
                        {col.breached} {lang === "ar" ? "متأخر" : "late"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-3 space-y-2 flex-1">
                  {col.items.map((it) => (
                    <div
                      key={it.id}
                      className={`group rounded-2xl border p-3 text-sm flex flex-col gap-2 transition-all hover:shadow-lg backdrop-blur-sm ${
                        it.breached
                          ? "border-destructive/60 bg-destructive/10 hover:shadow-destructive/10"
                          : "border-border/50 bg-background/60 hover:border-primary/40 hover:shadow-primary/5"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] text-muted-foreground uppercase">{it.code}</div>
                          <div className="truncate font-bold text-sm mt-0.5">{it.customer ?? it.brandName}</div>
                        </div>
                        <div className={`text-[10px] whitespace-nowrap shrink-0 px-2 py-0.5 rounded-full font-semibold num ${
                          it.breached ? "bg-destructive text-destructive-foreground" : "bg-muted/60 text-muted-foreground"
                        }`}>
                          {it.hoursIn < 1 ? `${Math.round(it.hoursIn * 60)}m` : `${it.hoursIn.toFixed(1)}h`}
                        </div>
                      </div>
                      {canAssign && (
                        <Select value={it.prepAssigneeId ?? "none"} onValueChange={(v) => assign.mutate({ id: it.id, assigneeId: v === "none" ? null : v })}>
                          <SelectTrigger className="h-8 text-[11px] rounded-full bg-muted/30 border-border/40" title={lang === "ar" ? "إسناد لموظف تحضير" : "Assign prep employee"}>
                            <span className="truncate">{prepLabel(it.prepAssigneeId)}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{lang === "ar" ? "غير مُسند" : "Unassigned"}</SelectItem>
                            {prepUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.email}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                      {nextStage(col.stage as Stage) && (
                        <div className="flex items-center gap-1 pt-2 border-t border-border/40">
                          <Button size="sm" variant="ghost" className="h-8 flex-1 gap-1 rounded-lg"
                            onClick={() => handlePrint(it.id)}
                            title={lang === "ar" ? "طباعة فاتورة التحضير" : "Print prep slip"}>
                            <Printer className="w-3.5 h-3.5" />
                            <span className="text-[11px]">{lang === "ar" ? "طباعة" : "Print"}</span>
                          </Button>
                          {prevStage(col.stage as Stage) && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg"
                              onClick={() => advance.mutate({ id: it.id, stage: prevStage(col.stage as Stage)! })}
                              title={lang === "ar" ? "رجوع للمرحلة السابقة" : "Move back"}>
                              <PrevIcon className="w-4 h-4" />
                            </Button>
                          )}
                          {canAssign && (
                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => { if (confirm(lang === "ar" ? "إلغاء الأوردر؟" : "Cancel order?")) advance.mutate({ id: it.id, stage: "cancelled" }); }}
                              title={lang === "ar" ? "إلغاء الأوردر" : "Cancel order"}>
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                          <Button size="icon" variant="default" className="h-8 w-8 rounded-lg shadow-md shadow-primary/20"
                            onClick={() => advance.mutate({ id: it.id, stage: nextStage(col.stage as Stage)! })}
                            title={lang === "ar" ? "المرحلة التالية" : "Next stage"}>
                            <NextIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {col.items.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-10 border border-dashed border-border/40 rounded-2xl">—</div>
                  )}
                  {col.count > col.items.length && (
                    <div className="text-[10px] text-muted-foreground text-center pt-2">+{col.count - col.items.length}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}