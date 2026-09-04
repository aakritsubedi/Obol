import type { IncomingMessage, ServerResponse } from "node:http";

export function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

export async function requestBody(req: IncomingMessage): Promise<string> {
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
