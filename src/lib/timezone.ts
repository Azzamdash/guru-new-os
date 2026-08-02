export const BUSINESS_TIMEZONE = "Africa/Cairo";

/** Formats any date as YYYY-MM-DD in the business timezone (Africa/Cairo). */
export function formatBusinessDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(d);
}

/** Returns today's date as YYYY-MM-DD in the business timezone (Africa/Cairo). */
export function getTodayInBusinessTimezone(): string {
  return formatBusinessDate(new Date());
}
