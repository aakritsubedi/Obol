import { existsSync, readdirSync, statSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const knownRelativeDirectories = [
  ".claude/projects",
  ".codex",
  ".config/opencode",
  ".copilot/logs",
  ".cursor/projects",
  ".continue"
];

function candidateDirectories(): string[] {
  const home = homedir();
  const candidates = knownRelativeDirectories.map((relative) => join(home, relative));
  const configDirectory = join(home, ".config");
  if (existsSync(configDirectory)) {
    for (const entry of readdirSync(configDirectory, { withFileTypes: true })) {
      if (entry.isDirectory() && /code|agent|claude|copilot|cursor|open/i.test(entry.name)) {
        candidates.push(join(configDirectory, entry.name));
      }
    }
  }
  return [...new Set(candidates)].filter((path) => {
    try { return existsSync(path) && statSync(path).isDirectory(); } catch { return false; }
  });
}

export class AgentLogWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly onChange: () => void,
    private readonly debounceMs = 2_000
  ) {}

  start(): void {
    this.discover();
    this.discoveryTimer = setInterval(() => this.discover(), 5 * 60 * 1000);
  }

  private discover(): void {
    if (this.closed) return;
    for (const directory of candidateDirectories()) {
      if (this.watchers.has(directory)) continue;
      try {
        const watcher = watch(directory, { recursive: process.platform === "darwin" }, () => this.schedule());
        watcher.on("error", () => {
          watcher.close();
          this.watchers.delete(directory);
        });
        this.watchers.set(directory, watcher);
      } catch {
        // A provider directory may disappear while the watcher is being set up.
      }
    }
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onChange();
    }, this.debounceMs);
  }

  close(): void {
    this.closed = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }
}
