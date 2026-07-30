// Report helpers: CSV export, print, WhatsApp share, delta calc

export type CsvColumn<T> = { key: keyof T | string; label: string; fmt?: (v: unknown, row: T) => string };

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportToCSV<T extends Record<string, unknown>>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((r) =>
    columns.map((c) => {
      const raw = c.fmt ? c.fmt((r as Record<string, unknown>)[c.key as string], r) : (r as Record<string, unknown>)[c.key as string];
      return csvEscape(raw);
    }).join(","),
  );
  // BOM for Excel/Arabic
  const csv = "\uFEFF" + [header, ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printReport() {
  window.print();
}

export async function shareSummary(title: string, text: string) {
  // Try Web Share API first (mobile)
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch {
      // user cancelled — fall through to whatsapp
    }
  }
  // WhatsApp Web fallback
  const msg = `*${title}*\n\n${text}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  return "whatsapp";
}

export function sendByEmail(subject: string, body: string) {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function fmtNum(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

export function pctDelta(current: number, previous: number): { value: number; label: string; direction: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { value: 0, label: "0%", direction: "flat" };
  if (previous === 0) return { value: 1, label: "+∞", direction: "up" };
  const v = (current - previous) / Math.abs(previous);
  const label = `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
  return { value: v, label, direction: v > 0.001 ? "up" : v < -0.001 ? "down" : "flat" };
}
