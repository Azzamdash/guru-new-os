import { describe, expect, it } from "vitest";
import {
  defaultTheme,
  initialTheme,
  readStoredTheme,
  THEME_STORAGE_KEY,
  writeStoredTheme,
  type ThemeValue,
} from "../src/lib/theme-storage";

/** In-memory stand-in for window.localStorage. */
function fakeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

describe("theme default", () => {
  it("defaults to the current look (emerald, dark)", () => {
    expect(defaultTheme()).toEqual({ theme: "emerald", mode: "dark" });
  });

  it("a first-time visit starts from the default", () => {
    expect(initialTheme(fakeStore())).toEqual({ theme: "emerald", mode: "dark" });
  });

  it("falls back to the default when storage is unavailable", () => {
    expect(initialTheme(null)).toEqual({ theme: "emerald", mode: "dark" });
    expect(readStoredTheme(fakeStore())).toBeNull();
  });
});

describe("theme persistence", () => {
  it("restores a saved choice", () => {
    const store = fakeStore();
    const choice: ThemeValue = { theme: "violet", mode: "light" };
    writeStoredTheme(store, choice);
    expect(initialTheme(store)).toEqual(choice);
  });

  it("stores under the namespaced key", () => {
    const store = fakeStore();
    writeStoredTheme(store, { theme: "midnight", mode: "dark" });
    expect(store.data.has(THEME_STORAGE_KEY)).toBe(true);
  });

  it("overwrites the previous choice", () => {
    const store = fakeStore();
    writeStoredTheme(store, { theme: "amber", mode: "dark" });
    writeStoredTheme(store, { theme: "amber", mode: "light" });
    expect(initialTheme(store)).toEqual({ theme: "amber", mode: "light" });
  });

  it("ignores corrupted or unknown values and falls back to the default", () => {
    expect(readStoredTheme(fakeStore({ [THEME_STORAGE_KEY]: "{not json" }))).toBeNull();
    expect(readStoredTheme(fakeStore({ [THEME_STORAGE_KEY]: '{"theme":"bogus","mode":"dark"}' }))).toBeNull();
    expect(readStoredTheme(fakeStore({ [THEME_STORAGE_KEY]: '{"theme":"violet","mode":"bogus"}' }))).toBeNull();
    expect(readStoredTheme(fakeStore({ [THEME_STORAGE_KEY]: "null" }))).toBeNull();
    expect(initialTheme(fakeStore({ [THEME_STORAGE_KEY]: "{not json" }))).toEqual(defaultTheme());
  });

  it("accepts every theme added in the second round", () => {
    const store = fakeStore();
    const added: ThemeValue[] = [
      { theme: "lime", mode: "dark" },
      { theme: "cyan", mode: "light" },
      { theme: "gold", mode: "dark" },
      { theme: "slate", mode: "light" },
      { theme: "forest", mode: "dark" },
      { theme: "sapphire", mode: "light" },
      { theme: "rose", mode: "dark" },
      { theme: "coral", mode: "light" },
    ];
    for (const choice of added) {
      writeStoredTheme(store, choice);
      expect(initialTheme(store)).toEqual(choice);
    }
  });

  it("accepts graphite", () => {
    const store = fakeStore();
    const choice: ThemeValue = { theme: "graphite", mode: "dark" };
    writeStoredTheme(store, choice);
    expect(initialTheme(store)).toEqual(choice);
  });

  it("never throws when storage rejects writes", () => {
    const throwing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => writeStoredTheme(throwing, { theme: "violet", mode: "dark" })).not.toThrow();
  });
});
