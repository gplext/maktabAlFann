import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "maf-theme";
const EVENT = "maf-theme-change";

export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  try { localStorage.setItem(KEY, theme); } catch { /* storage blocked: still switches for this visit */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme() {
  const [theme, setState] = useState<Theme>(() => currentTheme());
  useEffect(() => {
    const sync = () => setState(currentTheme());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
