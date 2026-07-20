import asyncio
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from backend.core.providers import PROVIDER_IDS, provider_definition
from backend.schemas.chat import ChatRequest, ImageRequest
from backend.services.anthropic import AnthropicClient, _anthropic_content
from backend.services.provider import _client


def test_provider_catalog_preserves_existing_and_adds_major_providers():
    assert {"openai", "compatible", "anthropic", "google", "groq"} <= PROVIDER_IDS
    assert provider_definition("openai").supports_images is True
    assert provider_definition("compatible").requires_base_url is True
    assert provider_definition("anthropic").protocol == "anthropic"


def test_chat_and_image_schemas_accept_catalog_providers_only():
    assert ChatRequest(message="Hello", provider="anthropic").provider == "anthropic"
    assert ImageRequest(prompt="Create a landscape", provider="google").provider == "google"
    with pytest.raises(ValidationError, match="Unsupported provider"):
        ChatRequest(message="Hello", provider="unknown-provider")


def test_openai_protocol_provider_uses_catalog_base_url():
    client = _client("google", "test-key", None, 30)
    assert str(client.base_url) == "https://generativelanguage.googleapis.com/v1beta/openai/"


def test_anthropic_translates_multimodal_openai_content():
    result = _anthropic_content(
        [
            {"type": "text", "text": "inspect"},
            {
                "type": "image_url",
                "image_url": {"url": "data:image/png;base64,YWJj"},
            },
        ]
    )
    assert result[0] == {"type": "text", "text": "inspect"}
    assert result[1]["source"] == {
        "type": "base64",
        "media_type": "image/png",
        "data": "YWJj",
    }


def test_anthropic_stream_adapter_matches_chat_service_contract(monkeypatch):
    client = AnthropicClient("test-key", "https://api.anthropic.com/v1")

    async def fake_stream(payload):
        assert payload["system"] == "Be concise"
        assert payload["model"] == "claude-test"
        for text in ("real", " time"):
            yield SimpleNamespace(
                choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
            )

    monkeypatch.setattr(client, "stream_messages", fake_stream)
    stream = client.chat.completions.create(
        model="claude-test",
        messages=[
            {"role": "system", "content": "Be concise"},
            {"role": "user", "content": "Hello"},
        ],
        stream=True,
    )

    async def collect():
        return [chunk.choices[0].delta.content async for chunk in stream]

    assert asyncio.run(collect()) == ["real", " time"]