import { describe, expect, it } from "vitest";
import { canonicalGovernorate, normalizeGovernorate } from "../src/lib/governorate.shared";

describe("normalizeGovernorate", () => {
  it("folds the English name Shopify sends onto the Arabic one rates are entered in", () => {
    // The bug this exists for: rates are typed in Arabic from the couriers page,
    // orders arrive with addr.province in English, and a raw compare never matched,
    // so every synced order accrued a silent zero fee.
    const pairs: Array<[string, string]> = [
      ["Cairo", "القاهرة"],
      ["Giza", "الجيزة"],
      ["Alexandria", "الإسكندرية"],
      ["Al Sharqia", "الشرقية"],
      ["Dakahlia", "الدقهلية"],
      ["Ismailia", "الإسماعيلية"],
      ["Kafr el-Sheikh", "كفر الشيخ"],
      ["Port Said", "بورسعيد"],
      ["Red Sea", "البحر الأحمر"],
      ["New Valley", "الوادي الجديد"],
      ["Luxor", "الأقصر"],
      ["Assiut", "أسيوط"],
      ["Beni Suef", "بني سويف"],
      ["North Sinai", "شمال سيناء"],
    ];
    for (const [english, arabic] of pairs) {
      expect(normalizeGovernorate(english)).toBe(normalizeGovernorate(arabic));
    }
  });

  it("ignores case, padding, and separator style", () => {
    expect(normalizeGovernorate("  CAIRO  ")).toBe(normalizeGovernorate("cairo"));
    expect(normalizeGovernorate("Kafr el-Sheikh")).toBe(normalizeGovernorate("kafr el sheikh"));
    expect(normalizeGovernorate("port_said")).toBe(normalizeGovernorate("Port Said"));
  });

  it("folds Arabic spelling variants that mean the same governorate", () => {
    expect(normalizeGovernorate("القاهره")).toBe(normalizeGovernorate("القاهرة"));
    expect(normalizeGovernorate("اسيوط")).toBe(normalizeGovernorate("أسيوط"));
    expect(normalizeGovernorate("الاسكندرية")).toBe(normalizeGovernorate("الإسكندرية"));
  });

  it("keeps distinct governorates distinct", () => {
    expect(normalizeGovernorate("Cairo")).not.toBe(normalizeGovernorate("Giza"));
    expect(normalizeGovernorate("شمال سيناء")).not.toBe(normalizeGovernorate("جنوب سيناء"));
    expect(normalizeGovernorate("المنيا")).not.toBe(normalizeGovernorate("المنوفية"));
  });

  it("passes an unrecognised name through instead of collapsing it to empty", () => {
    // An unmapped spelling must still match an identically-spelled rate rather
    // than silently becoming "" and colliding with every other unknown.
    expect(normalizeGovernorate("Somewhere Else")).toBe("somewhere else");
    expect(normalizeGovernorate("Somewhere Else")).not.toBe(normalizeGovernorate("Another Place"));
  });

  it("treats blank input as no governorate", () => {
    expect(normalizeGovernorate(null)).toBe("");
    expect(normalizeGovernorate(undefined)).toBe("");
    expect(normalizeGovernorate("   ")).toBe("");
  });

  it("canonicalises every write path onto one stored spelling", () => {
    // Shopify's English, the order form in English, and the order form in Arabic
    // all used to store a different string for the same governorate.
    expect(canonicalGovernorate("Cairo")).toBe("القاهرة");
    expect(canonicalGovernorate("cairo")).toBe("القاهرة");
    expect(canonicalGovernorate("القاهره")).toBe("القاهرة");
    expect(canonicalGovernorate("القاهرة")).toBe("القاهرة");
    expect(canonicalGovernorate("Kafr el-Sheikh")).toBe("كفر الشيخ");
    expect(canonicalGovernorate("Red Sea")).toBe("البحر الأحمر");
  });

  it("is stable — canonicalising an already-canonical name changes nothing", () => {
    for (const name of ["القاهرة", "أسيوط", "كفر الشيخ", "البحر الأحمر", "شمال سيناء"]) {
      expect(canonicalGovernorate(name)).toBe(name);
    }
  });

  it("leaves an unrecognised name alone rather than rewriting it", () => {
    expect(canonicalGovernorate("Somewhere Else")).toBe("Somewhere Else");
    expect(canonicalGovernorate("  padded  ")).toBe("padded");
    expect(canonicalGovernorate(null)).toBeNull();
    expect(canonicalGovernorate("   ")).toBeNull();
  });

  it("agrees with normalizeGovernorate, so a canonical write still matches a rate", () => {
    for (const name of ["Cairo", "القاهره", "Kafr el-Sheikh", "Assiut"]) {
      expect(normalizeGovernorate(canonicalGovernorate(name))).toBe(normalizeGovernorate(name));
    }
  });
});
