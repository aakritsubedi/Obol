/** The browser-side transport. Endpoint construction lives in endpoints.ts. */
export function rememberToken(): void {
  const value = new URLSearchParams(window.location.search).get("t");
  if (!value) return;
  localStorage.setItem("obol-token", value);
  // The native app hands the token over via ?t= once; drop it from the address
  // bar and this history entry so it does not linger in browser history.
  const url = new URL(window.location.href);
  url.searchParams.delete("t");
  window.history.replaceState(null, "", url);
}

export function authToken(): string {
  return localStorage.getItem("obol-token") || "";
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  const value = authToken();
  if (value) headers["x-token"] = value;
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      message = ((await response.json()) as { error?: string }).error || message;
    } catch {
      /* keep status */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
