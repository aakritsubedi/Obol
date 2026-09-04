import { json } from "../response.js";
import { configRoutes } from "./config.js";
import { eventRoutes } from "./events.js";
import { journalRoutes } from "./journal.js";
import { refreshRoutes } from "./refresh.js";
import { summaryRoutes } from "./summary.js";
import type { Route, RouteContext } from "./types.js";

const routes: Route[] = [summaryRoutes, journalRoutes, configRoutes, refreshRoutes, eventRoutes];

export async function handleApi(context: RouteContext): Promise<void> {
  try {
    for (const route of routes) {
      if (await route(context)) return;
    }
    json(context.res, 404, { error: "not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    json(context.res, 400, { error: message });
  }
}
