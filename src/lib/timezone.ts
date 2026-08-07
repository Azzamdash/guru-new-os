export const BUSINESS_TIMEZONE = "Africa/Cairo";

/** Formats any date as YYYY-MM-DD in the business timezone (Africa/Cairo). */
export function formatBusinessDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(d);
}

/** Returns today's date as YYYY-MM-DD in the business timezone (Africa/Cairo). */
export function getTodayInBusinessTimezone(): string {
  return formatBusinessDate(new Date());
}

/** Cairo's UTC offset (minutes, positive = ahead of UTC) at the given instant — varies with DST. */
function businessTimezoneOffsetMinutes(instant: Date): number {
  const parts: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - instant.getTime()) / 60000;
}

/**
 * UTC instant (ISO string) of local midnight for a YYYY-MM-DD business date —
 * e.g. "2026-08-07" (Cairo, UTC+3 in summer) → "2026-08-06T21:00:00.000Z".
 * Use this to turn a business-date "from" bound into a correct timestamptz
 * query bound instead of treating the bare date string as UTC.
 */
export function businessDateStartUTC(dateStr: string): string {
  const guess = new Date(`${dateStr}T00:00:00Z`);
  const offsetMin = businessTimezoneOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMin * 60000).toISOString();
}

/**
 * UTC instant (ISO string) of local 23:59:59.999 for a YYYY-MM-DD business
 * date. Use this to turn a business-date "to" bound into a correct
 * timestamptz query bound instead of appending a literal "T23:59:59Z".
 *
 * Computed as (start of the next business day) minus 1ms rather than
 * guessing "this date at 23:59:59.999" directly — offset-detection on a
 * non-zero-millisecond instant loses precision when round-tripped through
 * Intl.DateTimeFormat's whole-second parts, which would otherwise put the
 * result off by up to ~1 second.
 */
export function businessDateEndUTC(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDayStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(new Date(businessDateStartUTC(nextDayStr)).getTime() - 1).toISOString();
}
