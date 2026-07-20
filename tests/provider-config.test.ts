import { describe, expect, it } from "vitest";
import { normalizeAppConfig } from "@/lib/provider-config";
import type { ProviderConfig } from "@/types";

const openai: ProviderConfig = {
  configured: true,
  active: true,
  source: "database",
  base_url: "https://api.openai.com/v1",
  chat_model: "gpt-existing-model",
  image_model: "gpt-existing-image-model",
};

describe("provider config compatibility", () => {
  it("preserves the original top-level OpenAI config response", () => {
    const config = normalizeAppConfig({ openai });

    expect(config.active_provider).toBe("openai");
    expect(config.providers.openai).toEqual(openai);
    expect(config.providers.compatible?.configured).toBe(false);
  });

  it("preserves the current nested provider response", () => {
    const config = normalizeAppConfig({
      providers: { anthropic: { ...openai, active: true } },
      active_provider: "anthropic",
    });

    expect(config.active_provider).toBe("anthropic");
    expect(config.providers.anthropic?.chat_model).toBe("gpt-existing-model");
  });

  it("returns a safe OpenAI fallback for missing or malformed responses", () => {
    const config = normalizeAppConfig(undefined);

    expect(config.active_provider).toBe("openai");
    expect(config.providers.openai?.configured).toBe(false);
  });
});
