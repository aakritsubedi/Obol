import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { opencodeAdapter } from "./opencode.js";
import type { ProviderAdapter } from "./types.js";

// Adding an agent means writing one adapter and listing it here. Only providers
// that record a per-event timestamp can appear: without one there is no way to
// place work on a day or measure how long it took. That currently rules out
// Cursor (its transcripts carry no record times) and Copilot (plain process
// logs). OpenCode keeps its history in SQLite rather than transcript files, so
// its adapter reads records straight out of the database.
export const providers: ProviderAdapter[] = [claudeAdapter, codexAdapter, opencodeAdapter];

export function providerById(id: string): ProviderAdapter | undefined {
  return providers.find((provider) => provider.id === id);
}

export * from "./types.js";
