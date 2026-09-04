#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const dashboardRoot = resolve("dashboard/src");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const importPattern = /(?:from\s*|import\s*\()(["'])([^"']+)\1/g;

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (sourceExtensions.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

function featureName(path) {
  const match = relative(dashboardRoot, path).match(/^features\/([^/]+)/);
  return match?.[1] ?? null;
}

function targetFeature(from, specifier) {
  if (specifier.startsWith("@features/")) return specifier.slice("@features/".length).split("/")[0];
  if (specifier.startsWith("@shared/") || specifier.startsWith("@app/")) return null;
  if (!specifier.startsWith(".")) return null;
  const target = resolve(dirname(from), specifier);
  return featureName(target);
}

const violations = [];
for (const file of await filesUnder(dashboardRoot)) {
  const source = await readFile(file, "utf8");
  const owner = featureName(file);
  const isShared = relative(dashboardRoot, file).startsWith("shared/");
  for (const match of source.matchAll(importPattern)) {
    const target = targetFeature(file, match[2]);
    if (!target) continue;
    if (owner && owner !== target) {
      violations.push(`${relative(process.cwd(), file)} imports feature ${target} from feature ${owner}`);
    } else if (isShared) {
      violations.push(`${relative(process.cwd(), file)} imports feature ${target} from shared`);
    }
  }
}

if (violations.length) {
  console.error("Feature boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Feature boundaries OK");
}
