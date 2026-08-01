/** Pure helpers shared by orders-ops server functions and UI. */

export type ParsedSettlementLine = { tracking: string; amount: number; fee: number };

/** Parses pasted CSV text: tracking,amount[,fee] — header row optional. */
export function parseSettlementCsv(text: string): ParsedSettlementLine[] {
  const out: ParsedSettlementLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/[,;\t]/).map((p) => p.trim());
    if (parts.length < 2) continue;
    const tracking = parts[0]!.replace(/^["']|["']$/g, "");
    const amount = Number(parts[1]!.replace(/[^\d.-]/g, ""));
    const fee = parts[2] ? Number(parts[2].replace(/[^\d.-]/g, "")) : 0;
    if (!tracking || Number.isNaN(amount)) continue;
    out.push({ tracking, amount, fee: Number.isNaN(fee) ? 0 : fee });
  }
  return out;
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

export const WHATSAPP_EVENTS = [
  { key: "order_confirmed", label: "تأكيد الأوردر" },
  { key: "order_shipped", label: "تم الشحن" },
  { key: "out_for_delivery", label: "خرج للتسليم" },
  { key: "delivery_failed", label: "فشل التسليم" },
  { key: "order_delivered", label: "تم التسليم" },
  { key: "return_received", label: "استلام مرتجع" },
] as const;

export const CONFIRMATION_OUTCOMES = [
  { key: "confirmed", label: "مؤكد" },
  { key: "unreachable", label: "لا يرد" },
  { key: "postponed", label: "مؤجل" },
  { key: "cancelled", label: "ملغي" },
] as const;

export const RETURN_STATUS_LABELS: Record<string, string> = {
  requested: "مطلوب",
  received: "تم الاستلام",
  restocked: "رجع للمخزون",
  refunded: "تم الاسترداد",
  closed: "مقفول",
  cancelled: "ملغي",
};
