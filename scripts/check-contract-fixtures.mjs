#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtureNames = ["summary", "report", "journal"];
const canonicalRoot = join(process.cwd(), "contract", "fixtures");
const swiftRoot = join(process.cwd(), "macos", "Tests", "ObolCoreTests", "Fixtures");

function normalized(value) {
  return JSON.stringify(value);
}

let mismatches = 0;
for (const name of fixtureNames) {
  const [canonical, swift] = await Promise.all([
    readFile(join(canonicalRoot, `${name}.json`), "utf8"),
    readFile(join(swiftRoot, `${name}.json`), "utf8"),
  ]);
  if (normalized(JSON.parse(canonical)) !== normalized(JSON.parse(swift))) {
    console.error(`Contract fixture mismatch: ${name}.json`);
    mismatches += 1;
  }
}

if (mismatches > 0) {
  process.exitCode = 1;
} else {
  console.log(`Contract fixtures OK (${fixtureNames.length})`);
}
