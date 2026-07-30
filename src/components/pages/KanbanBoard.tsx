import type { ReactNode } from "react";

export function KanbanBoard<T>({
  icon, title, subtitle, action, columns, renderCard, emptyLabel,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action: ReactNode;
  columns: Array<{ key: string; label: string; accent: string; items: T[] }>;
  renderCard: (item: T) => ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="relative p-4 md:p-6 space-y-5">
      <div className="pointer-events-none fixed top-[-10%] right-[-10%] w-72 h-72 rounded-full bg-primary/10 blur-[120px] -z-10" />
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 border border-primary/25 text-primary">
            {icon}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl sm:text-2xl font-bold">{title}</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 line-clamp-1">{subtitle}</p>
          </div>
        </div>
        {action}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {columns.map((col) => (
          <div key={col.key} className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden flex flex-col min-h-[220px]">
            <div className={`px-4 py-3 border-b border-border/40 bg-gradient-to-b ${col.accent}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">{col.label}</h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-background/40 backdrop-blur num">
                  {col.items.length}
                </span>
              </div>
            </div>
            <div className="p-3 space-y-2 flex-1">
              {col.items.map((it) => renderCard(it))}
              {col.items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border/40 rounded-2xl">
                  {emptyLabel}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
