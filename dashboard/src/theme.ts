// The dashboard ships three theme choices: an explicit light or dark, plus
// "system", which follows the OS and is the default. The choice lives in
// localStorage so it survives reloads, and is mirrored onto <html> as
// data-theme so plain CSS - not React - owns every color swap.

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const STORAGE_KEY = "obol-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isTheme(raw) ? raw : "system";
  } catch {
    // Private browsing and disabled site data both throw on access.
    return "system";
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A theme we cannot persist still applies for this page view.
  }
}

export function systemTheme(): ResolvedTheme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme;
}

// "system" clears the attribute rather than stamping a resolved value, so the
// prefers-color-scheme rules in index.css keep control and the page follows the
// OS live without a re-render.
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme === "system" ? "light dark" : theme;
  return resolved;
}
