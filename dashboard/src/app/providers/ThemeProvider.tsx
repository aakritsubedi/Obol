import { applyTheme, loadTheme, saveTheme, type Theme } from "@shared/lib/theme";
import { ThemeContext } from "@shared/providers/theme";
import { type ReactNode, useCallback, useEffect, useState } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const choose = useCallback((next: Theme) => {
    saveTheme(next);
    setTheme(next);
    const root = document.documentElement;
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 200);
  }, []);

  return <ThemeContext.Provider value={[theme, choose]}>{children}</ThemeContext.Provider>;
}
