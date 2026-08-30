import { useCallback, useEffect, useState } from "react";
import { applyTheme, loadTheme, saveTheme, type Theme } from "../theme";
import { Icon, MONITOR, MOON, SUN } from "./icons";

const OPTIONS: { value: Theme; label: string; path: string }[] = [
  { value: "light", label: "Light", path: SUN },
  { value: "system", label: "Match system", path: MONITOR },
  { value: "dark", label: "Dark", path: MOON },
];

// index.html stamps the saved theme before first paint, so mounting only has to
// reconcile React's copy of the choice with what the document already shows.
export function useTheme(): [Theme, (next: Theme) => void] {
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

  return [theme, choose];
}

export default function ThemeToggle() {
  const [theme, choose] = useTheme();

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-hairline bg-panel p-0.5"
      role="radiogroup"
      aria-label="Color theme"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.label}
            className={`grid h-6 w-7 place-items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
              active ? "bg-raised text-ink shadow-raised" : "text-muted hover:text-ink"
            }`}
            onClick={() => choose(option.value)}
          >
            <Icon path={option.path} label={option.label} className="h-[13px] w-[13px] shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
