import { describe, expect, it } from "bun:test";
import { isMarketingCategory } from "../src/lib/expense-category.shared";

describe("isMarketingCategory", () => {
  it("matches the namings the original regex already covered", () => {
    expect(isMarketingCategory("Marketing")).toBe(true);
    expect(isMarketingCategory("تسويق")).toBe(true);
    expect(isMarketingCategory("ماركتينج")).toBe(true);
    expect(isMarketingCategory("إعلانات")).toBe(true);
    expect(isMarketingCategory("اعلانات")).toBe(true);
  });

  it("also matches common namings the original regex missed", () => {
    expect(isMarketingCategory("Ads")).toBe(true);
    expect(isMarketingCategory("Advertising")).toBe(true);
    expect(isMarketingCategory("دعاية")).toBe(true);
    expect(isMarketingCategory("سوشيال ميديا")).toBe(true);
    expect(isMarketingCategory("Social Media")).toBe(true);
    expect(isMarketingCategory("Media Buying")).toBe(true);
  });

  it("reads the slug when the display name carries no signal", () => {
    expect(isMarketingCategory("مصاريف الحملات", "marketing")).toBe(true);
  });

  it("does not flag unrelated categories", () => {
    expect(isMarketingCategory("رواتب")).toBe(false);
    expect(isMarketingCategory("Salaries")).toBe(false);
    expect(isMarketingCategory("إيجار")).toBe(false);
    expect(isMarketingCategory("Shipping")).toBe(false);
    expect(isMarketingCategory("مشتريات", "purchases")).toBe(false);
  });

  it("does not treat a word merely containing 'ad' as advertising", () => {
    expect(isMarketingCategory("Admin")).toBe(false);
    expect(isMarketingCategory("Bad debt")).toBe(false);
  });

  it("is false for an empty or missing category", () => {
    expect(isMarketingCategory("")).toBe(false);
    expect(isMarketingCategory(null)).toBe(false);
    expect(isMarketingCategory(undefined)).toBe(false);
  });
});
