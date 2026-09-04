import { json } from "../response.js";
import type { Route } from "./types.js";

export const journalRoutes: Route = async ({ req, res, url, handlers }) => {
  if (req.method === "GET" && url.pathname === "/api/journal") {
    const date = url.searchParams.get("date");
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      json(res, 400, { error: "date must be YYYY-MM-DD" });
      return true;
    }
    json(res, 200, await handlers.getJournal(date));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/sessions/active") {
    json(res, 200, await handlers.getActiveSessions());
    return true;
  }
  return false;
};
