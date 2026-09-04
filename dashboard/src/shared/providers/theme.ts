import type { Theme } from "@shared/lib/theme";
import { createContext, useContext } from "react";

export type ThemeContextValue = [Theme, (next: Theme) => void];

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
