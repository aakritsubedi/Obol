import { displayName } from "../lib/format";

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
// those files (macos/Obol/Sources/Components/ProviderCatalog.swift + Providers image
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

// Projects need their own palette: reusing the provider fallbacks collapses
// every project into four near-identical chart colors. Spacing hues by the
// golden angle keeps any two project colors visibly apart while staying
// deterministic, so a project keeps its color across refreshes.
export function projectColor(project: string): string {
  const normalized = normalizeAgent(project);
  const seed = normalized || project.toLowerCase();
  let hash = 0;
  for (let index = 0; index < seed.length; index++) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = (hash * 137.508) % 360;
  return `hsl(${hue.toFixed(1)} 55% 52%)`;
}
