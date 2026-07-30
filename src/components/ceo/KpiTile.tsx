import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  icon?: ReactNode;
};

const toneClasses: Record<NonNullable<Props["tone"]>, string> = {
  default: "border-border/60",
  positive: "border-emerald-500/40 bg-emerald-500/5",
  negative: "border-destructive/40 bg-destructive/5",
  warning: "border-amber-500/40 bg-amber-500/5",
};

export function KpiTile({ label, value, hint, delta, deltaSuffix = "%", tone = "default", icon }: Props) {
  const showDelta = typeof delta === "number" && Number.isFinite(delta);
  const positive = showDelta && (delta as number) > 0;
  const negative = showDelta && (delta as number) < 0;
  return (
    <div className={cn("rounded-2xl border bg-card/70 backdrop-blur-md p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2 min-w-0", toneClasses[tone])}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{label}</div>
        {icon && <div className="text-muted-foreground shrink-0">{icon}</div>}
      </div>
      <div className="text-lg sm:text-xl lg:text-2xl font-black leading-tight break-words">{value}</div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="text-muted-foreground truncate">{hint ?? "\u00A0"}</div>
        {showDelta && (
          <div
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold shrink-0",
              positive && "text-emerald-600 dark:text-emerald-400",
              negative && "text-destructive",
              !positive && !negative && "text-muted-foreground",
            )}
          >
            {positive ? <ArrowUpRight className="w-3 h-3" /> : negative ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(delta as number).toFixed(1)}{deltaSuffix}
          </div>
        )}
      </div>
    </div>
  );
}
