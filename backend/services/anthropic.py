import json
from types import SimpleNamespace
from typing import Any

import httpx


def _anthropic_content(content: str | list[dict[str, Any]]) -> str | list[dict[str, Any]]:
    if isinstance(content, str):
        return content
    blocks: list[dict[str, Any]] = []
    for part in content:
        if part.get("type") == "text":
            blocks.append({"type": "text", "text": part.get("text", "")})
        elif part.get("type") == "image_url":
            url = part.get("image_url", {}).get("url", "")
            if not url.startswith("data:image/") or ";base64," not in url:
                raise ValueError("Anthropic image inputs must be base64 data URLs")
            header, data = url.split(",", 1)
            media_type = header[5:].split(";", 1)[0]
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": data,
                    },
                }
            )
        elif part.get("type") == "file":
            filename = part.get("file", {}).get("filename", "attachment")
            blocks.append(
                {
                    "type": "text",
                    "text": f"[Binary attachment {filename} cannot be read by this provider.]",
                }
            )
    return blocks


class AnthropicModels:
    def __init__(self, owner: "AnthropicClient") -> None:
        self.owner = owner

    async def list(self) -> SimpleNamespace:
        response = await self.owner.request("GET", "/models")
        return SimpleNamespace(
            data=[SimpleNamespace(id=item["id"]) for item in response.get("data", [])]
        )


class AnthropicCompletions:
    def __init__(self, owner: "AnthropicClient") -> None:
        self.owner = owner

    def create(self, **kwargs: Any):
        system_parts: list[str] = []
        messages: list[dict[str, Any]] = []
        for message in kwargs["messages"]:
            if message["role"] == "system":
                content = message["content"]
                system_parts.append(content if isinstance(content, str) else str(content))
                continue
            messages.append(
                {
                    "role": message["role"],
                    "content": _anthropic_content(message["content"]),
                }
            )
        payload = {
            "model": kwargs["model"],
            "messages": messages,
            "max_tokens": kwargs.get("max_tokens", 4096),
            "temperature": kwargs.get("temperature", 0.7),
            "stream": kwargs.get("stream", False),
        }
        if system_parts:
            payload["system"] = "\n\n".join(system_parts)
        if payload["stream"]:
            return self.owner.stream_messages(payload)
        return self._create_response(payload)

    async def _create_response(self, payload: dict[str, Any]) -> SimpleNamespace:
        response = await self.owner.request("POST", "/messages", json=payload)
        text = "".join(
            block.get("text", "")
            for block in response.get("content", [])
            if block.get("type") == "text"
        )
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
        )


class AnthropicClient:
    """Small adapter that exposes Anthropic through the app's OpenAI-style contract."""

    def __init__(self, api_key: str, base_url: str, timeout: float = 90) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        self.models = AnthropicModels(self)
        self.chat = SimpleNamespace(completions=AnthropicCompletions(self))

    async def request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method, f"{self.base_url}{path}", headers=self.headers, **kwargs
            )
        response.raise_for_status()
        return response.json()

    async def stream_messages(self, payload: dict[str, Any]):
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/messages",
                headers=self.headers,
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    event = json.loads(line[6:])
                    delta = event.get("delta", {})
                    if event.get("type") == "content_block_delta" and delta.get("type") == "text_delta":
                        yield SimpleNamespace(
                            choices=[
                                SimpleNamespace(
                                    delta=SimpleNamespace(content=delta.get("text", ""))
                                )
                            ]
                        )