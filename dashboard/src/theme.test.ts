import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, isTheme, loadTheme, resolveTheme, STORAGE_KEY, saveTheme } from "./theme";

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

function stubDocument() {
  const attributes = new Map<string, string>();
  const style: Record<string, string> = {};
  vi.stubGlobal("document", {
    documentElement: {
      style,
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
      removeAttribute: (name: string) => void attributes.delete(name),
      getAttribute: (name: string) => attributes.get(name) ?? null,
    },
  });
  return { attributes, style };
}

describe("theme", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts only the three known choices", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("falls back to system for a missing or corrupt saved value", () => {
    stubStorage();
    expect(loadTheme()).toBe("system");
    stubStorage({ [STORAGE_KEY]: "neon" });
    expect(loadTheme()).toBe("system");
  });

  it("round-trips a saved choice", () => {
    stubStorage();
    saveTheme("dark");
    expect(loadTheme()).toBe("dark");
  });

  // Private browsing throws on any storage access; the page must still render.
  it("survives storage that throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    expect(loadTheme()).toBe("system");
    expect(() => saveTheme("light")).not.toThrow();
  });

  it("resolves system against the OS preference", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("dark") }));
    expect(resolveTheme("system")).toBe("dark");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(resolveTheme("system")).toBe("light");
    // An explicit choice ignores the OS entirely.
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("stamps an explicit choice and clears the attribute for system", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { attributes, style } = stubDocument();

    applyTheme("dark");
    expect(attributes.get("data-theme")).toBe("dark");
    expect(style.colorScheme).toBe("dark");

    // "system" must remove the attribute so the CSS media query regains control.
    applyTheme("system");
    expect(attributes.has("data-theme")).toBe(false);
    expect(style.colorScheme).toBe("light dark");
  });
});
