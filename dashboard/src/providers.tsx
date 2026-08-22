import { displayName } from "./components/format";

export interface ProviderConfig {
  /** Token matched inside the normalized agent string, e.g. "claude" within "claude-code". */
  id: string;
  name: string;
  color: string;
  website: string;
}

// Brand metadata for every coding agent ccusage can report. Logos are real
// favicons pulled from each provider's site and vendored under
// public/providers/<id>.png; the macOS popover mirrors both this table and
// those files (macos/Obol/Sources/ProviderCatalog.swift + Providers image
// sets in Assets.xcassets), so update all three together.
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: "claude", name: "Claude Code", color: "#BF4724", website: "https://claude.ai" },
  { id: "codex", name: "OpenAI Codex", color: "#1C855E", website: "https://openai.com" },
  { id: "cursor", name: "Cursor", color: "#6B4FA8", website: "https://cursor.com" },
  { id: "gemini", name: "Gemini CLI", color: "#2F6FD0", website: "https://gemini.google.com" },
  {
    id: "copilot",
    name: "GitHub Copilot",
    color: "#8A6D3B",
    website: "https://github.com/features/copilot",
  },
  { id: "opencode", name: "OpenCode", color: "#0E7490", website: "https://opencode.ai" },
  { id: "continue", name: "Continue", color: "#DB2777", website: "https://continue.dev" },
  { id: "openai", name: "OpenAI", color: "#8B8F98", website: "https://openai.com" },
];

const fallbackPalette = ["#2F6FD0", "#6B4FA8", "#8A6D3B", "#8B8F98"];

// Longest ids first so specific matches win, e.g. an agent named after a
// model family never steals a shorter prefix.
const matchOrder = [...PROVIDER_CONFIGS].sort((left, right) => right.id.length - left.id.length);

export function normalizeAgent(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fallbackColor(normalized: string): string {
  let hash = 0;
  for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return fallbackPalette[hash % fallbackPalette.length];
}

export function providerConfig(agent: string): ProviderConfig & { icon?: string } {
  const normalized = normalizeAgent(agent);
  if (!normalized) return { id: "", name: displayName(agent), color: fallbackColor(normalized), website: "" };
  const known = matchOrder.find((provider) => normalized.includes(provider.id));
  if (known) return known;
  return {
    id: normalized,
    name: displayName(agent),
    color: fallbackColor(normalized),
    website: "",
  };
}

export function providerName(agent: string): string {
  return providerConfig(agent).name;
}

export function providerColor(agent: string): string {
  return providerConfig(agent).color;
}

// Rounded badge carrying the provider's favicon on a neutral tile; agents
// outside the catalog fall back to a brand-tinted monogram so untracked
// providers stay visually distinct from misconfigured ones.
export function ProviderLogo({ agent, size = 20 }: { agent: string; size?: number }) {
  const config = providerConfig(agent);
  if (!config.website) {
    return (
      <span
        aria-hidden="true"
        className="inline-grid shrink-0 place-items-center font-bold text-white"
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(4, Math.round(size * 0.31)),
          backgroundColor: config.color,
          fontSize: Math.max(8, Math.round(size * 0.46)),
        }}
      >
        {(config.name.slice(0, 1) || "?").toUpperCase()}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center overflow-hidden border border-hairline bg-card"
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.31)),
      }}
    >
      <img
        src={`/providers/${config.id}.png`}
        alt=""
        draggable={false}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
