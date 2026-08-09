/**
 * Pure, DOM-free helpers for the app's color theme + light/dark mode choice.
 * Kept free of React/UI imports so it can be unit tested in a node environment.
 */

export type AppTheme =
  | "emerald"
  | "midnight"
  | "cyan"
  | "gold"
  | "slate"
  | "graphite"
  | "forest"
  | "sapphire";
export type AppMode = "dark" | "light";

export type ThemeValue = { theme: AppTheme; mode: AppMode };

export const VALID_THEMES: readonly AppTheme[] = [
  "emerald",
  "midnight",
  "cyan",
  "gold",
  "slate",
  "graphite",
  "forest",
  "sapphire",
];
export const VALID_MODES: readonly AppMode[] = ["dark", "light"];

export const THEME_STORAGE_KEY = "egurus:app-theme:v1";

/** The theme every user starts from until they pick one: the existing look, unchanged. */
export function defaultTheme(): ThemeValue {
  return { theme: "emerald", mode: "dark" };
}

/** Minimal subset of the Storage interface we depend on (testable with a fake). */
export type ThemeStore = Pick<Storage, "getItem" | "setItem">;

/** Read a previously stored choice. Returns null when absent or malformed. */
export function readStoredTheme(store: ThemeStore | null | undefined): ThemeValue | null {
  if (!store) return null;
  try {
    const raw = store.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ThemeValue> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (!VALID_THEMES.includes(parsed.theme as AppTheme)) return null;
    if (!VALID_MODES.includes(parsed.mode as AppMode)) return null;
    return { theme: parsed.theme as AppTheme, mode: parsed.mode as AppMode };
  } catch {
    return null;
  }
}

/** Persist the user's choice so it survives a refresh. Never throws. */
export function writeStoredTheme(store: ThemeStore | null | undefined, value: ThemeValue): void {
  if (!store) return;
  try {
    store.setItem(THEME_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage full / disabled — ignore */
  }
}

/** Value the app should render with on load: stored choice when valid, otherwise the default. */
export function initialTheme(store: ThemeStore | null | undefined): ThemeValue {
  return readStoredTheme(store) ?? defaultTheme();
}
