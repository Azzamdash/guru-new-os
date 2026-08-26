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

/**
 * Slugs that mean "marketing" outright. A slug is a stable, machine-set key —
 * unlike the display name it isn't re-worded on a whim — so an exact match
 * here is a definite answer, checked before falling back to reading the name.
 */
const MARKETING_SLUGS = new Set([
  "marketing",
  "ads",
  "advertising",
  "advertisement",
  "marketing_ads",
  "marketing-ads",
  "social",
  "social_media",
  "social-media",
  "media_buying",
  "media-buying",
]);

function normaliseSlug(slug: string | null | undefined): string {
  return (slug ?? "").trim().toLowerCase();
}

export function isMarketingCategory(
  name: string | null | undefined,
  slug?: string | null,
): boolean {
  if (MARKETING_SLUGS.has(normaliseSlug(slug))) return true;
  const label = `${name ?? ""} ${slug ?? ""}`.trim();
  if (!label) return false;
  return MARKETING_PATTERN.test(label);
}
