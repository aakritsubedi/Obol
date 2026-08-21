#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const args = new Set(process.argv.slice(2));
const scenarioIndex = process.argv.indexOf("--scenario");
const scenario = scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : "ok";
const slow = args.has("--slow");
const port = Number(process.env.OBOL_FAKE_RELEASE_PORT || 8787);
const zipName = "Obol-9.9.9.zip";
const configuredZip = process.env.OBOL_FIXTURE_ZIP;
const discoveredZip = existsSync(join(root, "dist"))
  ? readdirSync(join(root, "dist")).find((name) => /^Obol-.*\.zip$/.test(name))
  : undefined;
const zipPath = configuredZip || (discoveredZip ? join(root, "dist", discoveredZip) : undefined);
const zip = zipPath ? readFileSync(zipPath) : Buffer.from("fake Obol update archive");
const digest = createHash("sha256").update(zip).digest("hex");
const etag = '"fake-obol-9.9.9"';

function releasePayload() {
  const assets = [];
  if (scenario !== "noassets") {
    if (scenario !== "nodigest") {
      assets.push({
        name: zipName,
        size: zip.length,
        digest: `sha256:${scenario === "baddigest" ? "0".repeat(64) : digest}`,
        browser_download_url: `http://127.0.0.1:${port}/download/zip`,
      });
    } else {
      assets.push({
        name: zipName,
        size: zip.length,
        digest: null,
        browser_download_url: `http://127.0.0.1:${port}/download/zip`,
      });
    }
    if (scenario !== "nodigest") {
      assets.push({
        name: "SHA256SUMS",
        size: Buffer.byteLength(`${digest}  ${zipName}\n`),
        digest: null,
        browser_download_url: `http://127.0.0.1:${port}/download/sums`,
      });
    }
  }
  return {
    tag_name: "v9.9.9",
    name: "Obol 9.9.9 fixture",
    body: "Local updater fixture.",
    html_url: `http://127.0.0.1:${port}/release-notes`,
    prerelease: false,
    assets,
  };
}

function sendBuffer(response, body, contentType = "application/octet-stream") {
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    ETag: etag,
  });
  if (!slow) {
    response.end(body);
    return;
  }
  let offset = 0;
  const writeNext = () => {
    if (offset >= body.length) {
      response.end();
      return;
    }
    const next = body.subarray(offset, offset + 64 * 1024);
    offset += next.length;
    response.write(next);
    setTimeout(writeNext, 120);
  };
  writeNext();
}

const server = createServer((request, response) => {
  if (request.url === "/download/zip") {
    sendBuffer(response, zip);
    return;
  }
  if (request.url === "/download/sums") {
    sendBuffer(response, Buffer.from(`${digest}  ${zipName}\n`), "text/plain");
    return;
  }
  if (scenario === "404") {
    response.writeHead(404).end();
    return;
  }
  if (scenario === "ratelimit") {
    response
      .writeHead(429, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.ceil(Date.now() / 1000) + 600),
      })
      .end();
    return;
  }
  if (request.headers["if-none-match"] === etag) {
    response.writeHead(304, { ETag: etag }).end();
    return;
  }
  const body = Buffer.from(JSON.stringify(releasePayload()));
  sendBuffer(response, body, "application/json");
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `Fake release server listening on http://127.0.0.1:${port} (${scenario}${slow ? ", slow" : ""})`,
  );
  if (!zipPath) console.warn("No dist/Obol-*.zip found; happy-path staging will intentionally fail.");
});

process.once("SIGINT", () => server.close(() => process.exit(0)));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
