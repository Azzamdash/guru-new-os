export const BUSINESS_TIMEZONE = "Africa/Cairo";

/** Returns today's date as YYYY-MM-DD in the business timezone (Africa/Cairo). */
export function getTodayInBusinessTimezone(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE }).format(new Date());
}
