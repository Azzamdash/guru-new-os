/**
 * Whether an expense category is a marketing/advertising one — which is what
 * makes the ad-platform picker (TikTok / Meta / Google / Snapchat / …)
 * required on an expense.
 *
 * Matched against the category's name AND slug, so either can carry the
 * signal. The expenses page and the treasury page both ask this question;
 * keeping it here stops the two from drifting apart and disagreeing about
 * whether a given category needs a platform.
 */
const MARKETING_PATTERN =
  /market|تسويق|ماركت|إعلان|اعلان|دعاي|\bads?\b|advertis|سوشيال|social|media buying|ميديا باينج/i;

export function isMarketingCategory(
  name: string | null | undefined,
  slug?: string | null,
): boolean {
  const label = `${name ?? ""} ${slug ?? ""}`.trim();
  if (!label) return false;
  return MARKETING_PATTERN.test(label);
}
