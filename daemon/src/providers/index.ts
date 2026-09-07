import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { opencodeAdapter } from "./opencode.js";
import type { ProviderAdapter } from "./types.js";

// Journal adapters need per-event timestamps. Cost adapters are a separate
// track: ccusage supplies Claude/Codex/OpenCode totals, while providers such as
// Copilot can report token-bearing local records through the optional usage
// method. OpenCode keeps its journal in SQLite rather than transcript files.
export const providers: ProviderAdapter[] = [claudeAdapter, codexAdapter, copilotAdapter, opencodeAdapter];

export function providerById(id: string): ProviderAdapter | undefined {
  return providers.find((provider) => provider.id === id);
}

export * from "./types.js";
