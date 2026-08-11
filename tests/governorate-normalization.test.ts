import { describe, expect, it } from "vitest";
import { normalizeGovernorate } from "../src/lib/governorate.shared";

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
});
