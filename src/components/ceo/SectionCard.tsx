import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ title, subtitle, action, children, className }: Props) {
  return (
    <section className={cn("rounded-3xl border border-border/60 bg-card/50 backdrop-blur-xl shadow-sm p-4 md:p-6 space-y-4", className)}>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg md:text-xl font-black truncate">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
