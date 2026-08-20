import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface RuntimeState {
  port: number;
  token: string;
}

function runtimeState(): RuntimeState {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".obol", "runtime.json"), "utf8")) as RuntimeState;
  } catch {
    return { port: 4737, token: "" };
  }
}

function injectDaemonToken(token: string): Plugin {
  return {
    name: "inject-daemon-token",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        // The browser can use the Vite origin without exposing the daemon token
        // in its address bar. The proxy adds it only on the local server hop.
        if (token && request.url?.startsWith("/api/") && !request.url.includes("t=")) {
          const separator = request.url.includes("?") ? "&" : "?";
          request.url = `${request.url}${separator}t=${encodeURIComponent(token)}`;
        }
        next();
      });
    }
  };
}

const runtime = runtimeState();

export default defineConfig({
  plugins: [react(), injectDaemonToken(runtime.token)],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${runtime.port}`,
        changeOrigin: false
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
