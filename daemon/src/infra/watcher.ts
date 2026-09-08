import { existsSync, type FSWatcher, readdirSync, statSync, watch } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const knownRelativeDirectories = [
  ".claude/projects",
  ".codex",
  ".config/opencode",
  "Library/Application Support/Code/User/workspaceStorage",
  "Library/Application Support/Code - Insiders/User/workspaceStorage",
  "Library/Application Support/Cursor/User/globalStorage",
  ".continue",
];

// Transcripts, plus the SQLite databases Cursor and OpenCode keep their usage
// in. The `-wal`/`-shm`/`-journal` sidecars beside those databases are what get
// dropped: an open editor rewrites them continuously, and the providers read
// the database itself, so a sidecar write is churn the refresh cannot act on.
//
// Plain `.json` is deliberately absent. No adapter discovers one — every
// transcript is `.jsonl` and every database is `.vscdb` or `.db` — while the
// directories watched here are full of editor state files that are rewritten
// constantly. Matching them only ever bought a refresh with nothing to read.
const usageExtensions = [".jsonl", ".vscdb", ".db", ".sqlite", ".sqlite3"];

export function isUsageFilename(filename: string | Buffer | null): boolean {
  if (filename === null) return false;
  const value = filename.toString().replaceAll("\\", "/").toLowerCase();
  if (value.split("/").includes(".git")) return false;
  if (value.endsWith("-wal") || value.endsWith("-shm") || value.endsWith("-journal")) return false;
  return usageExtensions.some((extension) => value.endsWith(extension));
}

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
    try {
      return existsSync(path) && statSync(path).isDirectory();
    } catch {
      return false;
    }
  });
}

export class AgentLogWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly onChange: (changedPath?: string) => void,
    // An agent writes its transcript continuously, so this is not a wait for
    // quiet so much as a cap on how often a burst can start a refresh. The
    // refresh floor is a minute, so five seconds costs nothing in freshness.
    private readonly debounceMs = 5_000,
  ) {}

  start(): void {
    this.discover();
    // Only finds directories that did not exist at startup — an agent being
    // installed, or run for the first time. That does not happen on a
    // five-minute cadence, and each pass stats every candidate.
    this.discoveryTimer = setInterval(() => this.discover(), 30 * 60 * 1000);
  }

  private discover(): void {
    if (this.closed) return;
    for (const directory of candidateDirectories()) {
      if (this.watchers.has(directory)) continue;
      try {
        const watcher = watch(
          directory,
          { recursive: process.platform === "darwin" },
          (_eventType, filename) => {
            if (!isUsageFilename(filename)) return;
            const changedPath = filename === null ? undefined : join(directory, filename.toString());
            this.schedule(changedPath);
          },
        );
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

  private schedule(changedPath?: string): void {
    if (this.closed) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.onChange(changedPath);
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
