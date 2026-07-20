export const PROVIDERS = [
  { id: "openai", label: "OpenAI", supportsImages: true },
  {
    id: "compatible",
    label: "OpenAI compatible / Custom",
    supportsImages: true,
  },
  { id: "anthropic", label: "Anthropic (Claude)", supportsImages: false },
  { id: "google", label: "Google Gemini", supportsImages: false },
  { id: "openrouter", label: "OpenRouter", supportsImages: false },
  { id: "groq", label: "Groq", supportsImages: false },
  { id: "deepseek", label: "DeepSeek", supportsImages: false },
  { id: "xai", label: "xAI (Grok)", supportsImages: false },
  { id: "mistral", label: "Mistral AI", supportsImages: false },
  { id: "ollama", label: "Ollama (local)", supportsImages: false },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export function providerDetails(id: string) {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[1];
}
