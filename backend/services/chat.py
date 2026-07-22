import base64
import io
import json
import re
import zipfile
from collections.abc import AsyncIterator
from urllib.parse import urlparse
from xml.etree import ElementTree

from fastapi import HTTPException

from backend.repositories.conversations import (
    add_assistant_message,
    add_user_message,
)
from backend.schemas.chat import Attachment, ChatRequest, ImageRequest
from backend.services.agents import agent_prompt, parse_tool_call
from backend.services.images import generate_and_store_image
from backend.services.provider import client_for
from backend.services.storage import hydrate_attachment, persist_attachments
from backend.services.workspace_tools import execute_workspace_tool

SYSTEM_PROMPT = """Never claim that an image was generated unless an image tool
actually returned one.

Capabilities and limits: you can inspect the files included in the current
message. The application can open a public HTTP(S) page in the user's browser
when it emits a browser action, but it cannot control or read that page. You do
have an integrated image-generation tool for explicit image creation requests;
the application invokes it automatically before chat completion when the user
has enabled that permission. Generated images are saved in AI Studio storage.
You do not have unrestricted access to the user's computer, filesystem, network,
microphone, camera, or external accounts. Do not
claim to have performed an action or accessed a resource unless a tool result
in this conversation proves it. Ask the user to enable an explicit tool when
an action requires one."""

MAX_AGENT_STEPS = 8

SITE_URLS = {
    "whatsapp": ("WhatsApp Web", "https://web.whatsapp.com/"),
    "youtube": ("YouTube", "https://www.youtube.com/"),
    "gmail": ("Gmail", "https://mail.google.com/"),
    "google": ("Google", "https://www.google.com/"),
    "github": ("GitHub", "https://github.com/"),
    "facebook": ("Facebook", "https://www.facebook.com/"),
    "instagram": ("Instagram", "https://www.instagram.com/"),
    "linkedin": ("LinkedIn", "https://www.linkedin.com/"),
}

IMAGE_REQUEST_PATTERN = re.compile(
    r"\b(?:generate|create|make|draw|design|banao|bnao|bana|bna|bana do|bna do)\b"
    r"[\s\S]{0,80}\b(?:image|picture|photo|art|illustration|tasveer)\b"
    r"|\b(?:image|picture|photo|art|illustration|tasveer)\b"
    r"[\s\S]{0,80}\b(?:generate|create|make|draw|design|banao|bnao|bana|bna)\b",
    re.IGNORECASE,
)


def _browser_action(message: str) -> tuple[str, str] | None:
    normalized = message.lower().strip()
    if not re.search(r"\b(open|launch|visit|khol|kholo|kholen|kro|karo)\b", normalized):
        return None
    for alias, target in SITE_URLS.items():
        if re.search(rf"\b{re.escape(alias)}\b", normalized):
            return target
    match = re.search(r"https?://[^\s<>'\"]+", message, re.IGNORECASE)
    if not match:
        return None
    url = match.group(0).rstrip(".,);]")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    return parsed.hostname, url


def _is_image_request(message: str) -> bool:
    return bool(IMAGE_REQUEST_PATTERN.search(message))


def _validated_image(data_url: str) -> str:
    if data_url.startswith("data:image/"):
        return data_url
    raise HTTPException(400, "Invalid image attachment")


def _decode_data_url(data_url: str) -> bytes:
    try:
        _, encoded = data_url.split(",", 1)
        return base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise HTTPException(400, "Invalid attachment data") from exc


def _extract_docx(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
        root = ElementTree.fromstring(xml)
        return "\n".join(
            "".join(node.itertext()).strip()
            for node in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p")
            if "".join(node.itertext()).strip()
        )
    except (KeyError, ValueError, zipfile.BadZipFile, ElementTree.ParseError) as exc:
        raise HTTPException(400, "Could not read this DOCX attachment") from exc


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        return "\n\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages).strip()
    except Exception as exc:
        raise HTTPException(400, "Could not read this PDF attachment") from exc


def _extract_attachment_text(attachment) -> str | None:
    if attachment.text:
        return attachment.text
    if not attachment.data_url or attachment.type.startswith("image/"):
        return None
    data = _decode_data_url(attachment.data_url)
    suffix = attachment.name.rsplit(".", 1)[-1].lower() if "." in attachment.name else ""
    if suffix == "docx":
        return _extract_docx(data)[:100_000]
    if suffix == "pdf" or attachment.type == "application/pdf":
        return _extract_pdf(data)[:100_000]
    if attachment.type.startswith("text/") or suffix in {"txt", "md", "csv", "json", "xml", "html", "css", "js", "ts", "py", "log"}:
        return data.decode("utf-8", errors="replace")[:100_000]
    return None


def _attachment_content(attachments: list[Attachment]) -> list[dict]:
    """Build provider content parts without silently discarding attachments."""
    parts: list[dict] = []
    for attachment in attachments:
        extracted = _extract_attachment_text(attachment)
        if extracted is not None:
            parts.append({"type": "text", "text": f"\n\n--- {attachment.name} ---\n{extracted}"})
        elif attachment.data_url and attachment.type.startswith("image/"):
            parts.append({"type": "image_url", "image_url": {"url": _validated_image(attachment.data_url)}})
        elif attachment.data_url:
            if not attachment.data_url.startswith("data:"):
                raise HTTPException(400, f"Invalid attachment: {attachment.name}")
            parts.append({"type": "file", "file": {"filename": attachment.name, "file_data": attachment.data_url}})
        else:
            raise HTTPException(400, f"Attachment data missing: {attachment.name}")
    return parts


async def stream_chat(request: ChatRequest) -> AsyncIterator[str]:
    stored_attachments = persist_attachments(request.attachments)
    conversation_id, history = add_user_message(
        request.conversation_id,
        request.message,
        stored_attachments,
    )
    complete = ""
    assistant_saved = False
    try:
        browser_action = (
            _browser_action(request.message) if request.allow_browser_actions else None
        )
        if browser_action:
            label, url = browser_action
            complete = f"Opening [{label}]({url}) in your browser."
            yield _event({"type": "meta", "conversation_id": conversation_id})
            yield _event({"type": "browser_action", "url": url, "label": label})
            yield _event({"type": "delta", "content": complete})
            add_assistant_message(conversation_id, complete)
            assistant_saved = True
            yield _event({"type": "done"})
            return
        if request.agent == "designer" and _is_image_request(request.message) and not request.allow_image_generation:
            complete = (
                "Image generation is disabled in **Settings → Tool permissions**. "
                "Enable it and send this request again."
            )
            yield _event({"type": "meta", "conversation_id": conversation_id})
            yield _event({"type": "delta", "content": complete})
            add_assistant_message(conversation_id, complete)
            assistant_saved = True
            yield _event({"type": "done"})
            return
        if request.agent == "designer" and _is_image_request(request.message):
            result = await generate_and_store_image(
                ImageRequest(prompt=request.message, provider=request.provider)
            )
            complete = (
                f"![Generated image]({result['url']})\n\n"
                f"[Download generated image]({result['url']})\n\n"
                "Image generated and saved permanently in AI Studio."
            )
            yield _event({"type": "meta", "conversation_id": conversation_id})
            yield _event({"type": "delta", "content": complete})
            add_assistant_message(conversation_id, complete)
            assistant_saved = True
            yield _event({"type": "done"})
            return
        client, default_model, _ = client_for(request.provider)
        prompt = f"{agent_prompt(request.agent, request.system_prompt)}\n\n{SYSTEM_PROMPT}"
        messages: list[dict] = [{"role": "system", "content": prompt}]
        for index, row in enumerate(history):
            content: str | list[dict] = row["content"]
            stored_attachments = [
                hydrate_attachment(attachment)
                for attachment in json.loads(row["attachments_json"] or "[]")
            ]
            if stored_attachments or (
                index == len(history) - 1 and request.image
            ):
                content = [{"type": "text", "text": row["content"]}]
                if index == len(history) - 1 and request.image:
                    content.append({"type": "image_url", "image_url": {"url": _validated_image(request.image)}})
                content.extend(_attachment_content(stored_attachments))
            messages.append({"role": row["role"], "content": content})

        yield _event({"type": "meta", "conversation_id": conversation_id})
        if request.agent == "coder":
            if not request.allow_workspace_tools:
                messages[0]["content"] += (
                    "\n\nWorkspace tools are disabled. Explain that the user must enable "
                    "Coder workspace access before asking you to inspect or edit files."
                )
            else:
                read_paths: set[str] = set()
                for step in range(MAX_AGENT_STEPS):
                    response = await client.chat.completions.create(
                        model=request.model or default_model,
                        messages=messages,
                        temperature=request.temperature,
                        stream=False,
                    )
                    candidate = response.choices[0].message.content or ""
                    tool_call = parse_tool_call(candidate)
                    if not tool_call:
                        complete = candidate
                        if complete:
                            yield _event({"type": "delta", "content": complete})
                        add_assistant_message(conversation_id, complete)
                        assistant_saved = True
                        yield _event({"type": "done"})
                        return
                    name, arguments = tool_call
                    path = str(arguments.get("path", ".")).replace("\\", "/")
                    if name == "write_file" and arguments.get("overwrite") and path not in read_paths:
                        raise HTTPException(400, "Coder must read an existing file before overwriting it")
                    public_arguments = {
                        key: (f"<{len(value)} characters>" if key == "content" and isinstance(value, str) else value)
                        for key, value in arguments.items()
                    }
                    yield _event({"type": "tool_start", "tool": name, "arguments": public_arguments, "step": step + 1})
                    result = execute_workspace_tool(name, arguments)
                    if name == "read_file":
                        read_paths.add(path)
                    yield _event({"type": "tool_result", "tool": name, "result": {key: value for key, value in result.items() if key != "content"}, "step": step + 1})
                    messages.extend(
                        [
                            {"role": "assistant", "content": candidate},
                            {"role": "user", "content": f"Tool result for {name}:\n{json.dumps(result, ensure_ascii=False)}"},
                        ]
                    )
                raise HTTPException(429, f"Coder reached the {MAX_AGENT_STEPS}-step tool limit")

        response = await client.chat.completions.create(
            model=request.model or default_model,
            messages=messages,
            temperature=request.temperature,
            stream=True,
        )
        async for chunk in response:
            # Compatible APIs can emit a final usage-only chunk with no choices.
            if not chunk.choices:
                continue
            text = chunk.choices[0].delta.content or ""
            if text:
                complete += text
                yield _event({"type": "delta", "content": text})
        add_assistant_message(conversation_id, complete)
        assistant_saved = True
        yield _event({"type": "done"})
    except Exception as exc:
        yield _event({"type": "error", "message": str(exc)})
    finally:
        if complete and not assistant_saved:
            add_assistant_message(conversation_id, complete)


def _event(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"
