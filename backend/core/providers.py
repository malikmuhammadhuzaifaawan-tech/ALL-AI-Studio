from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderDefinition:
    id: str
    label: str
    protocol: str
    default_base_url: str
    default_chat_model: str
    default_image_model: str = ""
    requires_base_url: bool = False
    supports_images: bool = False


PROVIDERS: tuple[ProviderDefinition, ...] = (
    ProviderDefinition("openai", "OpenAI", "openai", "https://api.openai.com/v1", "gpt-4.1-mini", "gpt-image-1", supports_images=True),
    ProviderDefinition("compatible", "OpenAI compatible", "openai", "", "", "", requires_base_url=True, supports_images=True),
    ProviderDefinition("anthropic", "Anthropic (Claude)", "anthropic", "https://api.anthropic.com/v1", "claude-sonnet-4-20250514"),
    ProviderDefinition("google", "Google Gemini", "openai", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    ProviderDefinition("openrouter", "OpenRouter", "openai", "https://openrouter.ai/api/v1", "openai/gpt-4.1-mini"),
    ProviderDefinition("groq", "Groq", "openai", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    ProviderDefinition("deepseek", "DeepSeek", "openai", "https://api.deepseek.com", "deepseek-chat"),
    ProviderDefinition("xai", "xAI (Grok)", "openai", "https://api.x.ai/v1", "grok-3-mini"),
    ProviderDefinition("mistral", "Mistral AI", "openai", "https://api.mistral.ai/v1", "mistral-small-latest"),
    ProviderDefinition("ollama", "Ollama", "openai", "http://localhost:11434/v1", "llama3.2"),
)

PROVIDER_MAP = {provider.id: provider for provider in PROVIDERS}
PROVIDER_IDS = frozenset(PROVIDER_MAP)


def provider_definition(provider: str) -> ProviderDefinition:
    return PROVIDER_MAP.get(provider, PROVIDER_MAP["compatible"])