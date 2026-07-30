import { useMemo, useState, useDeferredValue } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableSkeleton } from "@/components/TableSkeleton";
import { useLang } from "@/lib/i18n";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

export function PaginatedTable<T extends Record<string, any>>({
  rows,
  columns,
  isLoading,
  pageSize: initialPageSize = 25,
  searchable = true,
  searchKeys,
  emptyText,
  getRowKey,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  isLoading?: boolean;
  pageSize?: number;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  emptyText?: string;
  getRowKey?: (row: T, idx: number) => string | number;
}) {
  const { lang } = useLang();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (!dq.trim()) return list;
    const needle = dq.toLowerCase();
    const keys = searchKeys ?? (columns.map((c) => c.key) as (keyof T)[]);
    return list.filter((r) =>
      keys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle))
    );
  }, [rows, dq, searchKeys, columns]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder={lang === "ar" ? "بحث..." : "Search..."}
            className="max-w-xs"
          />
          <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span>{lang === "ar" ? "لكل صفحة" : "Per page"}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
              <SelectTrigger className="h-8 w-[80px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        {isLoading ? (
          <div className="p-3">
            <TableSkeleton rows={Math.min(pageSize, 8)} cols={columns.length} />
          </div>
        ) : total === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {emptyText ?? (lang === "ar" ? "لا توجد بيانات" : "No data")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`text-start px-3 py-2 font-medium ${c.className ?? ""}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row, i) => (
                <tr key={getRowKey ? getRowKey(row, i) : (row.id ?? i)} className="border-t border-border hover:bg-muted/20">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-3 py-2 align-middle ${c.className ?? ""}`}>
                      {c.render ? c.render(row) : (row[c.key] as React.ReactNode) ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {lang === "ar"
            ? `عرض ${total === 0 ? 0 : start + 1}–${Math.min(start + pageSize, total)} من ${total}`
            : `Showing ${total === 0 ? 0 : start + 1}–${Math.min(start + pageSize, total)} of ${total}`}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            {lang === "ar" ? "السابق" : "Prev"}
          </Button>
          <span className="tabular-nums">{safePage + 1} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            {lang === "ar" ? "التالي" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}