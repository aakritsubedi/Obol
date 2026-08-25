import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import type { BlocksReport, CcusageReport, DayJournal, Summary, WidgetConfig } from "./types.js";

export interface ServerHandlers {
  getSummary: () => Summary;
  getReport: () => CcusageReport;
  getBlocks: () => BlocksReport;
  getConfig: () => WidgetConfig;
  updateConfig: (patch: Partial<WidgetConfig>) => Promise<WidgetConfig>;
  refresh: () => Promise<void>;
  getJournal: (date: string | null) => Promise<DayJournal>;
}

export interface ServerOptions {
  port: number;
  token: string;
  staticRoot: string;
  handlers: ServerHandlers;
}

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

function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

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

async function requestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolvePromise(body));
    req.on("error", reject);
  });
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
      await this.handleApi(req, res, url);
      return;
    }
    await this.serveStatic(req, res, url);
  }

  private async handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      if (req.method === "GET" && url.pathname === "/api/summary") {
        json(res, 200, this.options.handlers.getSummary());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/report") {
        json(res, 200, this.options.handlers.getReport());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/blocks/active") {
        json(res, 200, this.options.handlers.getBlocks());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/journal") {
        const date = url.searchParams.get("date");
        if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          json(res, 400, { error: "date must be YYYY-MM-DD" });
          return;
        }
        json(res, 200, await this.options.handlers.getJournal(date));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/config") {
        json(res, 200, this.options.handlers.getConfig());
        return;
      }
      if (req.method === "PUT" && url.pathname === "/api/config") {
        const value = JSON.parse(await requestBody(req)) as Partial<WidgetConfig>;
        json(res, 200, await this.options.handlers.updateConfig(value));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/refresh") {
        await this.options.handlers.refresh();
        json(res, 200, this.options.handlers.getSummary());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-store",
          Connection: "keep-alive",
        });
        res.write(`event: summary\ndata: ${JSON.stringify(this.options.handlers.getSummary())}\n\n`);
        this.clients.add(res);
        req.on("close", () => this.clients.delete(res));
        return;
      }
      json(res, 404, { error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      json(res, 400, { error: message });
    }
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
