import { json } from "../response.js";
import type { Route } from "./types.js";

export const summaryRoutes: Route = ({ req, res, url, handlers }) => {
  if (req.method === "GET" && url.pathname === "/api/summary") {
    json(res, 200, handlers.getSummary());
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/report") {
    json(res, 200, handlers.getReport());
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/blocks/active") {
    json(res, 200, handlers.getBlocks());
    return true;
  }
  return false;
};
