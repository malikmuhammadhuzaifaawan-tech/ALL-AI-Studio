from fastapi import HTTPException
from openai import AsyncOpenAI

from backend.core.providers import provider_definition
from backend.core.security import SecretDecryptionError
from backend.repositories.providers import get_provider_credentials, save_provider
from backend.schemas.provider import ProviderRequest
from backend.services.anthropic import AnthropicClient


def _client(provider: str, api_key: str, base_url: str | None, timeout: float):
    definition = provider_definition(provider)
    resolved_url = base_url or definition.default_base_url
    if definition.protocol == "anthropic":
        return AnthropicClient(api_key, resolved_url, timeout)
    return AsyncOpenAI(api_key=api_key, base_url=resolved_url, timeout=timeout)


def client_for(provider: str) -> tuple[object, str, str]:
    try:
        api_key, base_url, chat_model, image_model = get_provider_credentials(
            provider
        )
    except SecretDecryptionError as exc:
        raise HTTPException(500, str(exc)) from exc
    if not api_key:
        prefix = provider.upper().replace("-", "_")
        raise HTTPException(400, f"{prefix}_API_KEY is not configured")
    client = _client(provider, api_key, base_url, 90)
    return client, chat_model, image_model


async def activate_provider(request: ProviderRequest) -> int:
    definition = provider_definition(request.provider)
    base_url = (request.base_url or "").strip().rstrip("/") or None
    if definition.requires_base_url and not base_url:
        raise HTTPException(
            400, "Base URL is required for an OpenAI-compatible provider"
        )
    if base_url and not base_url.startswith(("http://", "https://")):
        raise HTTPException(400, "Base URL must start with http:// or https://")
    client = _client(request.provider, request.api_key.strip(), base_url, 30)
    try:
        models = await client.models.list()
    except Exception as exc:
        raise HTTPException(502, f"Provider connection failed: {exc}") from exc
    save_provider(
        request.provider,
        request.api_key.strip(),
        base_url,
        request.chat_model.strip(),
        (request.image_model or "").strip(),
    )
    return len(models.data)


async def available_models(provider: str) -> list[str]:
    client, _, _ = client_for(provider)
    try:
        response = await client.models.list()
        return sorted(model.id for model in response.data)
    except Exception as exc:
        raise HTTPException(502, f"Could not fetch models: {exc}") from exc
