"use client";

import * as React from "react";

/**
 * V3.7.67 — Theme system (no external dep).
 *
 * - Mode: "light" | "dark" | "system" (default).
 * - Persist mode trong localStorage (`mes-theme`).
 * - Resolved theme = mode === "system" ? prefers-color-scheme : mode.
 * - Apply qua `data-theme` attribute trên <html>.
 * - PWA route được lock light bằng CSS (xem globals.css).
 *
 * Anti-FOUC: script đồng bộ trong <head> set data-theme TRƯỚC React mount
 * (xem app/layout.tsx — themeInitScript).
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "mes-theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<ThemeMode>("system");
  const [resolved, setResolved] = React.useState<ResolvedTheme>("light");

  // Hydrate mode + resolved sau mount (init script đã set data-theme nên không nhấp nháy)
  React.useEffect(() => {
    const initial = readStoredMode();
    setModeState(initial);
    const initialResolved =
      initial === "system" ? (systemPrefersDark() ? "dark" : "light") : initial;
    setResolved(initialResolved);
    applyTheme(initialResolved);
  }, []);

  // Listen prefers-color-scheme khi mode === "system"
  React.useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next: ResolvedTheme = e.matches ? "dark" : "light";
      setResolved(next);
      applyTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    const nextResolved: ResolvedTheme =
      next === "system" ? (systemPrefersDark() ? "dark" : "light") : next;
    setResolved(nextResolved);
    applyTheme(nextResolved);
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    // Safe fallback — tránh crash nếu component dùng useTheme bên ngoài provider
    return {
      mode: "system",
      resolved: "light",
      setMode: () => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[useTheme] called outside ThemeProvider");
        }
      },
    };
  }
  return ctx;
}

/**
 * Inline script để đặt data-theme TRƯỚC React mount → tránh FOUC.
 * Nội dung được render qua dangerouslySetInnerHTML trong <head>.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${STORAGE_KEY}';var v=localStorage.getItem(k);var m=(v==='light'||v==='dark'||v==='system')?v:'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;
