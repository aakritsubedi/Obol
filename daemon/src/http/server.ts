import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import type { Summary } from "@obol/contract";
import { json } from "./response.js";
import { handleApi } from "./routes/index.js";
import type { ServerOptions } from "./types.js";

export type { ServerHandlers, ServerOptions } from "./types.js";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]" ||
        parsed.hostname === "::1")
    );
  } catch {
    return false;
  }
}

function listen(server: ReturnType<typeof createServer>, requestedPort: number): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const start = (port: number, fallbackAllowed: boolean) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.removeListener("listening", onListening);
        if (fallbackAllowed && error.code === "EADDRINUSE") {
          server.removeListener("error", onError);
          start(0, false);
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        server.removeListener("error", onError);
        const address = server.address() as AddressInfo;
        resolvePromise(address.port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };
    start(requestedPort, requestedPort !== 0);
  });
}

export class DaemonServer {
  private readonly server = createServer((req, res) => {
    void this.handle(req, res);
  });
  private readonly clients = new Set<ServerResponse>();
  private boundPort = 0;

  constructor(private readonly options: ServerOptions) {}

  get port(): number {
    return this.boundPort;
  }

  async start(): Promise<number> {
    this.boundPort = await listen(this.server, this.options.port);
    return this.boundPort;
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.end();
    this.clients.clear();
    await new Promise<void>((resolvePromise) => this.server.close(() => resolvePromise()));
  }

  broadcast(summary: Summary): void {
    const payload = `event: summary\ndata: ${JSON.stringify(summary)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private authenticated(req: IncomingMessage, url: URL, res: ServerResponse): boolean {
    const origin = req.headers.origin;
    if (origin && !isLoopbackOrigin(origin)) {
      json(res, 403, { error: "origin not allowed" });
      return false;
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    const supplied =
      url.searchParams.get("t") ||
      req.headers["x-token"] ||
      (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.slice("Bearer ".length)
        : "");
    if (supplied !== this.options.token) {
      json(res, 401, { error: "unauthorized" });
      return false;
    }
    return true;
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://127.0.0.1:${this.boundPort || this.options.port}`);
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") {
        if (!this.authenticated(req, url, res)) return;
        res.writeHead(204, {
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Token",
          "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
        });
        res.end();
        return;
      }
      if (!this.authenticated(req, url, res)) return;
      await handleApi({ req, res, url, handlers: this.options.handlers, clients: this.clients });
      return;
    }
    await this.serveStatic(req, res, url);
  }

  private async serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      json(res, 405, { error: "method not allowed" });
      return;
    }
    const root = resolve(this.options.staticRoot);
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      json(res, 400, { error: "invalid path" });
      return;
    }
    let filePath = resolve(root, `.${normalize(pathname)}`);
    if (!filePath.startsWith(`${root}/`) && filePath !== root) {
      json(res, 403, { error: "forbidden" });
      return;
    }
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      if (extname(filePath)) {
        json(res, 404, { error: "not found" });
        return;
      }
      filePath = join(root, "index.html");
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": extname(filePath) === ".html" ? "no-store" : "public, max-age=31536000, immutable",
        "Content-Length": body.byteLength,
      });
      if (req.method === "HEAD") res.end();
      else res.end(body);
    } catch {
      json(res, 404, { error: "dashboard is not built; run npm run build -w dashboard" });
    }
  }
}
