import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerHandlers } from "../types.js";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  handlers: ServerHandlers;
  clients: Set<ServerResponse>;
}

export type Route = (context: RouteContext) => boolean | Promise<boolean>;
