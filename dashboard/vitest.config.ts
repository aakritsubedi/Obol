import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": resolve("src/app"),
      "@features": resolve("src/features"),
      "@shared": resolve("src/shared"),
      "@contract": resolve("../contract/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    environmentMatchGlobs: [["src/**/*.tsx", "jsdom"]],
    setupFiles: ["./src/test/setup.ts"],
  },
});
