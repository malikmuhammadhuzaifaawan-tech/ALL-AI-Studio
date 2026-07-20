import { PROVIDERS } from "@/config/providers";
import type { AppConfig, ProviderConfig } from "@/types";

const EMPTY_PROVIDER: ProviderConfig = {
  configured: false,
  active: false,
  source: "default",
  base_url: "",
  chat_model: "",
  image_model: "",
};

function isProviderConfig(value: unknown): value is ProviderConfig {
  return Boolean(value && typeof value === "object" && "base_url" in value);
}

/**
 * Accepts both the current provider-map response and the original response,
 * where `openai` and `compatible` lived at the top level. Keeping this at the
 * UI boundary also protects hot-reload/query caches containing the old shape.
 */
export function normalizeAppConfig(value: unknown): AppConfig {
  const raw: Record<string, unknown> =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const nested =
    raw.providers && typeof raw.providers === "object"
      ? (raw.providers as Record<string, unknown>)
      : {};
  const providers: Record<string, ProviderConfig> = {};

  for (const definition of PROVIDERS) {
    const candidate = nested[definition.id] ?? raw[definition.id];
    providers[definition.id] = isProviderConfig(candidate)
      ? { ...EMPTY_PROVIDER, ...candidate }
      : { ...EMPTY_PROVIDER };
  }

  const requestedActive =
    typeof raw.active_provider === "string" ? raw.active_provider : undefined;
  const activeProvider =
    (requestedActive && providers[requestedActive] && requestedActive) ||
    Object.entries(providers).find(([, provider]) => provider.active)?.[0] ||
    "openai";

  return { providers, active_provider: activeProvider };
}
