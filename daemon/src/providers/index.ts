import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { opencodeAdapter } from "./opencode.js";
import type { ProviderAdapter } from "./types.js";

// Journal adapters need per-event timestamps. Cost adapters are a separate
// track: ccusage supplies Claude/Codex/OpenCode totals, while Copilot's VS Code
// sessions and Cursor's SQLite store report token-bearing local records through
// the optional usage method. OpenCode and Cursor keep their journals in SQLite.
export const providers: ProviderAdapter[] = [
  claudeAdapter,
  codexAdapter,
  copilotAdapter,
  cursorAdapter,
  opencodeAdapter,
];

export function providerById(id: string): ProviderAdapter | undefined {
  return providers.find((provider) => provider.id === id);
}

export * from "./types.js";
