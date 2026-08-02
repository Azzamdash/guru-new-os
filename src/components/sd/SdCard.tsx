import type { ReactNode } from "react";
import { formatBusinessDate } from "@/lib/timezone";

export function SdCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl bg-card/60 backdrop-blur-xl border border-border/60 shadow-lg p-4 md:p-5 ${className}`}>
      {children}
    </div>
  );
}

export function periodToRange(period: string, from?: string, to?: string) {
  if (period === "custom") return { from: from ?? null, to: to ?? null };
  const now = new Date();
  const iso = (d: Date) => formatBusinessDate(d);
  const start = new Date(now);
  if (period === "today") start.setDate(now.getDate());
  else if (period === "week") start.setDate(now.getDate() - 6);
  else if (period === "month") start.setDate(1);
  else if (period === "year") { start.setMonth(0); start.setDate(1); }
  return { from: iso(start), to: iso(now) };
}