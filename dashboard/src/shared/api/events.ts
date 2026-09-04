import { authToken } from "./client";
import type { Summary } from "./types";

export function subscribe(onSummary: (summary: Summary) => void, onError: () => void): () => void {
  // EventSource cannot send headers, so the SSE stream is the one request that
  // still authenticates with the token as a query parameter.
  const value = authToken();
  let url = "/api/events";
  if (value) {
    const target = new URL(url, window.location.origin);
    target.searchParams.set("t", value);
    url = `${target.pathname}${target.search}`;
  }
  const source = new EventSource(url);
  source.addEventListener("summary", (event) => {
    try {
      onSummary(JSON.parse((event as MessageEvent).data) as Summary);
    } catch {
      onError();
    }
  });
  source.onerror = onError;
  return () => source.close();
}
