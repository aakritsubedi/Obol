import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { asRecord, stringValue } from "../../shared/coerce.js";

// VS Code and its forks key per-project state by an opaque workspace hash and
// record which folder that hash stands for in `workspace.json` beside it.
// Resolving the hash is what lets an editor session join the same project as
// the CLI agents, which name projects after the working directory.
const WORKSPACE_FILE = "workspace.json";

/**
 * Slugs a folder location the way Claude Code names project directories, so the
 * same checkout lands under one project whichever agent did the work.
 */
export function folderSlug(value: unknown): string {
  const raw = stringValue(value).trim();
  if (!raw || raw === "empty-window") return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "file:") return decodeURIComponent(parsed.pathname).replace(/\//g, "-");
  } catch {
    // Some versions store a plain path rather than a URI; fall through.
  }
  return raw.replace(/^file:\/\//, "").replace(/\//g, "-");
}

/** The project a workspace-storage directory belongs to, or its own name. */
export async function workspaceProject(directory: string): Promise<string> {
  try {
    const workspace = asRecord(JSON.parse(await readFile(join(directory, WORKSPACE_FILE), "utf8")));
    return folderSlug(workspace.folder) || basename(directory);
  } catch {
    // A workspace can be removed, or belong to a window that never opened a
    // folder. Its own directory name still identifies it well enough to group.
    return basename(directory);
  }
}

/**
 * Resolves a workspace id to its project. An id that is already a location is
 * slugged directly; an opaque hash is looked up under `storageRoot`. Returns
 * empty when the id names nothing, so callers fall back to their own grouping
 * rather than showing a hash as a project name.
 */
export async function projectForWorkspaceId(storageRoot: string, workspaceId: unknown): Promise<string> {
  const raw = stringValue(workspaceId).trim();
  if (!raw || raw === "empty-window") return "";
  const slug = folderSlug(raw);
  // A slugged location keeps its separators; a bare hash comes back unchanged.
  if (slug !== raw) return slug;
  const resolved = await workspaceProject(join(storageRoot, raw));
  return resolved === raw ? "" : resolved;
}
