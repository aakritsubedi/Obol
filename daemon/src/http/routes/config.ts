import type { WidgetConfig } from "@obol/contract";
import { json, requestBody } from "../response.js";
import type { Route } from "./types.js";

export const configRoutes: Route = async ({ req, res, url, handlers }) => {
  if (req.method === "GET" && url.pathname === "/api/config") {
    json(res, 200, handlers.getConfig());
    return true;
  }
  if (req.method === "PUT" && url.pathname === "/api/config") {
    const value = JSON.parse(await requestBody(req)) as Partial<WidgetConfig>;
    json(res, 200, await handlers.updateConfig(value));
    return true;
  }
  return false;
};
