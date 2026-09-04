import type { Route } from "./types.js";

export const eventRoutes: Route = ({ req, res, url, handlers, clients }) => {
  if (req.method !== "GET" || url.pathname !== "/api/events") return false;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-store",
    Connection: "keep-alive",
  });
  res.write(`event: summary\ndata: ${JSON.stringify(handlers.getSummary())}\n\n`);
  clients.add(res);
  req.on("close", () => clients.delete(res));
  return true;
};
