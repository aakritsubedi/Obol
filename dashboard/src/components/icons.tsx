// One stroked 16x16 icon set for the whole dashboard. Text glyphs (a gear
// emoji, an arrow character) render differently per font and per platform and
// cannot be aligned with a label, so every affordance draws from here instead.

interface IconProps {
  path: string;
  label?: string;
  className?: string;
}

export function Icon({ path, label, className = "h-3.5 w-3.5 shrink-0" }: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path d={path} />
    </svg>
  );
}

export const CLOCK = "M8 4.2V8l2.4 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z";
export const COPY =
  "M11.1 3.9H4.9A1.4 1.4 0 0 0 3.5 5.3v6.2M4.9 6.1h6.2a1.4 1.4 0 0 1 1.4 1.4v6.2a1.4 1.4 0 0 1-1.4 1.4H4.9a1.4 1.4 0 0 1-1.4-1.4V7.5a1.4 1.4 0 0 1 1.4-1.4Z";
export const CHECK = "M3.2 8.4 6.4 11.5 12.8 4.9";
export const CHEVRON_DOWN = "M4.5 6.2 8 9.7l3.5-3.5";
export const CHEVRON_UP = "M4.5 9.7 8 6.2l3.5 3.5";
export const CHEVRON_RIGHT = "M6.2 4.5 9.7 8l-3.5 3.5";
export const FOLDER =
  "M1.9 4.1A1.2 1.2 0 0 1 3.1 3h2.6l1.3 1.6h5.9A1.2 1.2 0 0 1 14.1 5.8v5.4a1.2 1.2 0 0 1-1.2 1.2H3.1a1.2 1.2 0 0 1-1.2-1.2Z";
export const BRANCH =
  "M4.5 3.6v8.8M4.5 3.6a1.4 1.4 0 1 0 0-.1ZM4.5 12.4a1.4 1.4 0 1 0 0 .1ZM11.5 5a1.4 1.4 0 1 0 0-.1ZM11.5 6.4v.9a2.6 2.6 0 0 1-2.6 2.6H4.5";

// A stack — one task that several agent sessions were folded into.
export const LAYERS = "M8 2.2 2.1 5.3 8 8.4l5.9-3.1ZM2.1 8.5 8 11.6l5.9-3.1M2.1 11.4 8 14.5l5.9-3.1";

export const SLIDERS =
  "M3 13.6V9.4M3 6.6V2.4M8 13.6V7.9M8 5.1V2.4M13 13.6v-2.7M13 8.1V2.4M1.4 9.4h3.2M6.4 5.1h3.2M11.4 10.9h3.2";
export const REFRESH = "M13.9 8a5.9 5.9 0 1 1-1.73-4.17M12.2 1.1v2.8h-2.8";
export const SHARE =
  "M9.6 2.4h4v4M13.6 2.4 8.2 7.8M12.4 9.3v3.1a1.2 1.2 0 0 1-1.2 1.2H3.6a1.2 1.2 0 0 1-1.2-1.2V4.8a1.2 1.2 0 0 1 1.2-1.2h3.1";
export const DOWNLOAD = "M8 2.4v7.6M4.9 6.9 8 10l3.1-3.1M2.6 13.2h10.8";
export const CLOSE = "M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6";
export const SUN =
  "M8 1.9v1.5M8 12.6v1.5M1.9 8h1.5M12.6 8h1.5M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1M10.6 8a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0Z";
export const MOON = "M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6 5.7 5.7 0 1 0 13.4 9.7Z";
export const MONITOR = "M2.6 3.4h10.8v6.9H2.6zM6 13.4h4M8 10.3v3.1";
