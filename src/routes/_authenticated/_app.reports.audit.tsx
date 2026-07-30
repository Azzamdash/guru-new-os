import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listAuditLog } from "@/lib/audit.functions";
import { useLang } from "@/lib/i18n";
import { ShieldAlert, Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_app/reports/audit")({
  head: () => ({ meta: [
    { title: "سجل التدقيق المالي — e-GURUS" },
    { name: "description", content: "سجل كامل بكل التعديلات على الفواتير والمصروفات والمعاملات النقدية." },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: Page,
});

const TABLES = [
  { v: "expense_entries", ar: "المصروفات", en: "Expenses" },
  { v: "sales_invoices", ar: "فواتير المبيعات", en: "Sales invoices" },
  { v: "cash_transactions", ar: "المعاملات النقدية", en: "Cash transactions" },
  { v: "supplier_invoices", ar: "فواتير الموردين", en: "Supplier invoices" },
  { v: "supplier_payments", ar: "مدفوعات الموردين", en: "Supplier payments" },
  { v: "orders", ar: "الأوردرات", en: "Orders" },
];

function Page() {
  const { lang } = useLang();
  const L = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const fn = useServerFn(listAuditLog);
  const [tableName, setTableName] = useState<string>("all");
  const [operation, setOperation] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const limit = 25;

  const q = useQuery({
    queryKey: ["audit", tableName, operation, from, to, page],
    queryFn: () => fn({ data: {
      tableName: tableName === "all" ? null : tableName,
      operation: operation === "all" ? null : (operation as "INSERT"|"UPDATE"|"DELETE"),
      from: from || null,
      to: to || null,
      limit,
      offset: (page - 1) * limit,
    }}),
  });

  const opIcon = (op: string) => {
    if (op === "INSERT") return <Plus className="w-3.5 h-3.5" />;
    if (op === "UPDATE") return <Pencil className="w-3.5 h-3.5" />;
    return <Trash2 className="w-3.5 h-3.5" />;
  };
  const opTone = (op: string) =>
    op === "INSERT" ? "text-emerald-500" : op === "UPDATE" ? "text-amber-500" : "text-destructive";

  const diffFields = (oldD: unknown, newD: unknown): string[] => {
    const o = (oldD ?? {}) as Record<string, unknown>;
    const n = (newD ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
    const diffs: string[] = [];
    for (const k of keys) {
      if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) diffs.push(k);
    }
    return diffs;
  };

  const totalPages = Math.max(1, Math.ceil((q.data?.total ?? 0) / limit));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <ShieldAlert className="w-7 h-7" /> {L("سجل التدقيق المالي", "Financial Audit Log")}
      </h1>
      <Card className="card-gradient p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{L("الجدول", "Table")}</label>
          <Select value={tableName} onValueChange={(v) => { setTableName(v); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("الكل", "All")}</SelectItem>
              {TABLES.map((t) => <SelectItem key={t.v} value={t.v}>{L(t.ar, t.en)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{L("العملية", "Operation")}</label>
          <Select value={operation} onValueChange={(v) => { setOperation(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{L("الكل", "All")}</SelectItem>
              <SelectItem value="INSERT">{L("إضافة", "Insert")}</SelectItem>
              <SelectItem value="UPDATE">{L("تعديل", "Update")}</SelectItem>
              <SelectItem value="DELETE">{L("حذف", "Delete")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{L("من", "From")}</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{L("إلى", "To")}</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
        </div>
        <Button variant="outline" onClick={() => { setTableName("all"); setOperation("all"); setFrom(""); setTo(""); setPage(1); }}>
          {L("مسح الفلاتر", "Clear")}
        </Button>
      </Card>

      <Card className="card-gradient p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-muted-foreground">
              <th className="p-2 text-start">{L("التاريخ", "When")}</th>
              <th className="p-2 text-start">{L("المستخدم", "User")}</th>
              <th className="p-2 text-start">{L("الجدول", "Table")}</th>
              <th className="p-2 text-center">{L("العملية", "Op")}</th>
              <th className="p-2 text-start">{L("الحقول المتغيرة", "Changed fields")}</th>
              <th className="p-2"></th>
            </tr></thead>
            <tbody>
              {q.isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">…</td></tr>}
              {(q.data?.rows ?? []).map((r) => {
                const fields = r.operation === "UPDATE" ? diffFields(r.old_data, r.new_data) : [];
                const tbl = TABLES.find((x) => x.v === r.table_name);
                return (
                  <>
                    <tr key={r.id} className="border-b border-border/50 align-top">
                      <td className="p-2 num text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-US")}</td>
                      <td className="p-2 text-xs">{r.actor_email}</td>
                      <td className="p-2">{tbl ? L(tbl.ar, tbl.en) : r.table_name}</td>
                      <td className={`p-2 text-center ${opTone(r.operation)}`}>
                        <span className="inline-flex items-center gap-1">{opIcon(r.operation)}{r.operation}</span>
                      </td>
                      <td className="p-2 text-xs">
                        {r.operation === "UPDATE"
                          ? fields.slice(0, 6).join(", ") + (fields.length > 6 ? "…" : "")
                          : L("—", "—")}
                      </td>
                      <td className="p-2 text-end">
                        <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                          {expanded === r.id ? L("إخفاء", "Hide") : L("عرض", "View")}
                        </Button>
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr className="bg-muted/30">
                        <td colSpan={6} className="p-3">
                          <DiffView
                            oldData={r.old_data as Record<string, unknown> | null}
                            newData={r.new_data as Record<string, unknown> | null}
                            operation={r.operation}
                            search={search}
                            L={L}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {!q.isLoading && (q.data?.rows ?? []).length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{L("لا توجد سجلات", "No records")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="tabular-nums">{L("الإجمالي", "Total")}: {q.data?.total ?? 0}</div>
          <Input
            placeholder={L("ابحث داخل التغييرات (اسم الحقل أو القيمة)…", "Search inside changes (field or value)…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs h-8"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {L("السابق", "Prev")}
            </Button>
            <span className="tabular-nums min-w-[70px] text-center">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {L("التالي", "Next")}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {L(
            "يتم تسجيل كل إضافة أو تعديل أو حذف على الجداول المالية تلقائيًا. السجلات غير قابلة للتعديل أو الحذف.",
            "Every insert/update/delete on financial tables is auto-recorded. Records are immutable.",
          )}
        </p>
      </Card>
    </div>
  );
}

function DiffView({
  oldData,
  newData,
  operation,
  search,
  L,
}: {
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  operation: string;
  search: string;
  L: (ar: string, en: string) => string;
}) {
  const o = oldData ?? {};
  const n = newData ?? {};
  const keys = Array.from(new Set([...Object.keys(o), ...Object.keys(n)])).sort();
  const fmt = (v: unknown) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const q = search.trim().toLowerCase();
  const rows = keys
    .map((k) => {
      const before = fmt(o[k]);
      const after = fmt(n[k]);
      const changed = operation === "UPDATE" ? before !== after : true;
      return { k, before, after, changed };
    })
    .filter((row) => {
      if (operation === "UPDATE" && !row.changed) return false;
      if (!q) return true;
      return (
        row.k.toLowerCase().includes(q) ||
        row.before.toLowerCase().includes(q) ||
        row.after.toLowerCase().includes(q)
      );
    });

  if (rows.length === 0) {
    return <div className="text-xs text-muted-foreground">{L("لا يوجد اختلاف مطابق للبحث", "No matching differences")}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <th className="p-1.5 text-start w-1/4">{L("الحقل", "Field")}</th>
            <th className="p-1.5 text-start w-3/8">{L("قبل", "Before")}</th>
            <th className="p-1.5 text-start w-3/8">{L("بعد", "After")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.k} className="border-b border-border/30 align-top">
              <td className="p-1.5 font-mono text-[11px]">{row.k}</td>
              <td className="p-1.5">
                <span className="inline-block px-1.5 py-0.5 rounded bg-destructive/10 text-destructive break-all">
                  {row.before}
                </span>
              </td>
              <td className="p-1.5">
                <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 break-all">
                  {row.after}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}