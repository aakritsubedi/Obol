import type { Theme } from "@shared/lib/theme";
import { useTheme } from "@shared/providers/theme";
import { Icon, MONITOR, MOON, SUN } from "@shared/ui/icons";

const OPTIONS: { value: Theme; label: string; path: string }[] = [
  { value: "light", label: "Light", path: SUN },
  { value: "system", label: "Match system", path: MONITOR },
  { value: "dark", label: "Dark", path: MOON },
];

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
          // biome-ignore lint/a11y/useSemanticElements: This is a keyboard-accessible custom radio control.
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
