import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PROVIDER_CONFIGS, providerConfig, providerColor, providerName } from "./providers";

describe("provider catalog", () => {
  it("has unique ids, names, hex colors, and website urls", () => {
    const ids = new Set(PROVIDER_CONFIGS.map((provider) => provider.id));
    expect(ids.size).toBe(PROVIDER_CONFIGS.length);
    for (const provider of PROVIDER_CONFIGS) {
      expect(provider.name).not.toBe("");
      expect(provider.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(provider.website).toMatch(/^https:\/\/[a-z0-9.-]+/);
    }
  });

  it("ships a vendored favicon for every catalog entry", async () => {
    for (const provider of PROVIDER_CONFIGS) {
      await access(path.resolve(process.cwd(), "public", "providers", `${provider.id}.png`));
    }
  });

  it("matches ccusage agent strings to their provider config", () => {
    expect(providerName("claude-code")).toBe("Claude Code");
    expect(providerName("codex-cli")).toBe("OpenAI Codex");
    expect(providerName("cursor-agent")).toBe("Cursor");
    expect(providerName("gemini-cli")).toBe("Gemini CLI");
    expect(providerName("github-copilot")).toBe("GitHub Copilot");
    expect(providerName("opencode")).toBe("OpenCode");
    expect(providerName("continue")).toBe("Continue");
    expect(providerName("openai")).toBe("OpenAI");
  });

  it("is case and separator insensitive", () => {
    expect(providerConfig("CODEX").name).toBe("OpenAI Codex");
    expect(providerConfig("GitHub Copilot").color).toBe(providerColor("copilot"));
    expect(providerConfig("  claude_code ")).toEqual(providerConfig("Claude-Code"));
  });

  it("does not confuse opencode with openai", () => {
    expect(providerName("opencode")).toBe("OpenCode");
    expect(providerName("openai")).toBe("OpenAI");
    expect(providerColor("opencode")).not.toBe(providerColor("openai"));
  });

  it("keeps known colors stable for chart consistency", () => {
    expect(providerColor("claude")).toBe("#BF4724");
    expect(providerColor("codex")).toBe("#1C855E");
    expect(providerColor("gemini")).toBe("#2F6FD0");
    expect(providerColor("cursor")).toBe("#6B4FA8");
    expect(providerColor("copilot")).toBe("#8A6D3B");
    expect(providerColor("openai")).toBe("#8B8F98");
  });

  it("falls back to a deterministic color and display name", () => {
    const first = providerConfig("my-custom-agent");
    const second = providerConfig("My Custom Agent");
    expect(first.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(first).toEqual(second);
    expect(first.name).toBe("My Custom Agent");
    // No website means no vendored favicon; the logo falls back to a monogram.
    expect(first.website).toBe("");
    expect(providerName("claude-code")).not.toBe("");
  });

  it("handles empty or missing agents", () => {
    expect(providerName("")).toBe("Unknown");
    expect(providerConfig("").color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
