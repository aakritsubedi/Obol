import { json } from "../response.js";
import type { Route } from "./types.js";

export const refreshRoutes: Route = async ({ req, res, url, handlers }) => {
  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await handlers.refresh();
    json(res, 200, handlers.getSummary());
    return true;
  }
  return false;
};
