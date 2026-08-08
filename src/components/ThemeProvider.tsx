import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  defaultTheme,
  initialTheme,
  writeStoredTheme,
  type AppMode,
  type AppTheme,
  type ThemeValue,
} from "@/lib/theme-storage";

type ThemeCtxValue = ThemeValue & {
  setTheme: (theme: AppTheme) => void;
  setMode: (mode: AppMode) => void;
};

const ThemeCtx = createContext<ThemeCtxValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<ThemeValue>(defaultTheme());

  // Read the persisted choice after mount (localStorage isn't available during SSR).
  useEffect(() => {
    setValue(initialTheme(typeof window === "undefined" ? null : window.localStorage));
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove(
      "theme-emerald",
      "theme-violet",
      "theme-midnight",
      "theme-amber",
      "mode-dark",
      "mode-light",
    );
    html.classList.add(`theme-${value.theme}`, `mode-${value.mode}`);
  }, [value]);

  const setTheme = (theme: AppTheme) => {
    setValue((prev) => {
      const next = { ...prev, theme };
      writeStoredTheme(window.localStorage, next);
      return next;
    });
  };
  const setMode = (mode: AppMode) => {
    setValue((prev) => {
      const next = { ...prev, mode };
      writeStoredTheme(window.localStorage, next);
      return next;
    });
  };

  return (
    <ThemeCtx.Provider value={{ ...value, setTheme, setMode }}>{children}</ThemeCtx.Provider>
  );
}

export function useAppTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useAppTheme must be used within ThemeProvider");
  return ctx;
}
