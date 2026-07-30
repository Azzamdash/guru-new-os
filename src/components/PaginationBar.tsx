import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLang } from "@/lib/i18n";

export function usePagination<T>(rows: T[] | undefined, initialSize = 25) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialSize);
  const list = rows ?? [];
  const total = list.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const slice = useMemo(() => list.slice(start, start + pageSize), [list, start, pageSize]);
  return { slice, total, page: safePage, setPage, pageSize, setPageSize, pageCount, start };
}

export function PaginationBar({
  page, setPage, pageSize, setPageSize, total, pageCount, start,
}: {
  page: number;
  setPage: (p: number | ((prev: number) => number)) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  pageCount: number;
  start: number;
}) {
  const { lang } = useLang();
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground px-3 py-2 border-t border-border/50">
      <div className="tabular-nums">
        {lang === "ar"
          ? `${start + 1}–${Math.min(start + pageSize, total)} من ${total}`
          : `${start + 1}–${Math.min(start + pageSize, total)} of ${total}`}
      </div>
      <div className="flex items-center gap-2">
        <span>{lang === "ar" ? "لكل صفحة" : "Per page"}</span>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
          <SelectTrigger className="h-7 w-[70px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          {lang === "ar" ? "السابق" : "Prev"}
        </Button>
        <span className="tabular-nums min-w-[70px] text-center">{page + 1} / {pageCount}</span>
        <Button variant="outline" size="sm" className="h-7" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
          {lang === "ar" ? "التالي" : "Next"}
        </Button>
      </div>
    </div>
  );
}