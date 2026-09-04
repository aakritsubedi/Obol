interface Option<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

// A recessed track with one raised thumb. The track uses `panel` and the thumb
// uses `raised`, which is what lets the same markup read correctly in both
// themes - in dark mode the thumb is lighter than the track, not darker.
export default function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div
      className="flex shrink-0 gap-0.5 rounded-full border border-hairline bg-panel p-0.5"
      aria-label={label}
      role="radiogroup"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: This is a keyboard-accessible custom radio control.
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-2.5 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink ${
              option.disabled
                ? "cursor-not-allowed text-muted opacity-40"
                : active
                  ? "bg-raised font-semibold text-ink shadow-raised"
                  : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
