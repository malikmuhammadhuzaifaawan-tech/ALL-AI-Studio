import asyncio
import base64
import binascii
import ipaddress
import socket
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

from fastapi import HTTPException

from backend.core.config import settings
from backend.repositories.providers import resolve_image_provider
from backend.schemas.chat import ImageRequest
from backend.services.provider import client_for


async def generate_image(request: ImageRequest) -> dict:
    try:
        image_provider = resolve_image_provider(request.provider)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    client, _, default_model = client_for(image_provider)
    # A model selected for a non-image chat provider must never override the
    # configured model of the image provider chosen above.
    model = request.model if image_provider == request.provider else default_model
    model = model or default_model
    if not model:
        raise HTTPException(
            400,
            "No image model is configured. Add an image model in Settings or choose one here.",
        )
    quality = request.quality
    if model.lower() == "dall-e-3" and quality == "auto":
        quality = "standard"
    try:
        result = await client.images.generate(
            model=model,
            prompt=request.prompt,
            size=request.size,
            quality=quality,
            n=1,
        )
        image = result.data[0]
        if image.b64_json:
            return {
                "url": f"data:image/png;base64,{image.b64_json}",
                "revised_prompt": image.revised_prompt,
                "provider": image_provider,
            }
        if image.url:
            return {
                "url": image.url,
                "revised_prompt": image.revised_prompt,
                "provider": image_provider,
            }
        raise RuntimeError("Provider returned no image data")
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        if "invalid_api_key" in message:
            raise HTTPException(
                401,
                "The image provider rejected the configured API key. Create a new A6API key, then update it in Settings and activate the provider again.",
            ) from exc
        if "no_available_channel" in message:
            raise HTTPException(
                503,
                f"A6API has no available image-generation channel for '{model}'. Choose an available image model such as 'gpt-image-1' and try again.",
            ) from exc
        raise HTTPException(502, str(exc)) from exc


async def generate_and_store_image(request: ImageRequest) -> dict:
    result = await generate_image(request)
    source = result["url"]
    if source.startswith("data:image/"):
        try:
            _, encoded = source.split(",", 1)
            content = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(502, "Image provider returned invalid image data") from exc
        suffix = ".png"
    else:
        content, suffix = await asyncio.to_thread(_download_image, source)

    directory = settings.root / "data" / "generated"
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{suffix}"
    path = directory / filename
    path.write_bytes(content)
    return {
        **result,
        "url": f"/generated/{filename}",
        "filename": filename,
    }


def _download_image(url: str) -> tuple[bytes, str]:
    if not url.startswith("https://"):
        raise HTTPException(502, "Image provider returned an invalid URL")
    _require_public_host(url)
    request = Request(url, headers={"User-Agent": "AI-Studio/1.0"})
    with urlopen(request, timeout=30) as response:
        _require_public_host(response.geturl())
        content_type = response.headers.get_content_type()
        if not content_type.startswith("image/"):
            raise HTTPException(502, "Image provider URL did not return an image")
        content = response.read(25 * 1024 * 1024 + 1)
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(502, "Generated image is larger than 25 MB")
    suffix = {
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(content_type, ".png")
    return content, suffix


def _require_public_host(url: str) -> None:
    from urllib.parse import urlparse

    hostname = urlparse(url).hostname
    if not hostname:
        raise HTTPException(502, "Image provider returned an invalid URL")
    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as exc:
        raise HTTPException(502, "Could not resolve the generated image URL") from exc
    if not addresses or any(not address.is_global for address in addresses):
        raise HTTPException(502, "Generated image URL points to a private network")
