import asyncio
import base64
import io
import zipfile

from fastapi import HTTPException
import pytest
from fastapi.testclient import TestClient

from app import app
from backend.core.config import settings
from backend.database.migrations import initialize_database
from backend.repositories.providers import (
    get_provider_credentials,
    public_configuration,
    resolve_image_provider,
    save_provider,
)
from backend.repositories.conversations import get_conversation
from backend.schemas.chat import ChatRequest, ImageRequest
from backend.services.chat import stream_chat
from backend.services import images


client = TestClient(app)


@pytest.fixture(autouse=True)
def isolated_test_storage(tmp_path):
    original_database = settings.database_path
    original_key = settings.encryption_key_path
    original_root = settings.root
    object.__setattr__(settings, "database_path", tmp_path / "chat.db")
    object.__setattr__(settings, "encryption_key_path", tmp_path / ".secret.key")
    object.__setattr__(settings, "root", tmp_path)
    initialize_database()
    try:
        yield
    finally:
        object.__setattr__(settings, "database_path", original_database)
        object.__setattr__(settings, "encryption_key_path", original_key)
        object.__setattr__(settings, "root", original_root)


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_public_config_never_exposes_api_key() -> None:
    response = client.get("/api/config")
    assert response.status_code == 200
    serialized = response.text.lower()
    assert "api_key" not in serialized
    assert "encrypted" not in serialized


def test_provider_settings_survive_new_database_connections(tmp_path) -> None:
    original_database = settings.database_path
    original_key = settings.encryption_key_path
    object.__setattr__(settings, "database_path", tmp_path / "chat.db")
    object.__setattr__(settings, "encryption_key_path", tmp_path / ".secret.key")
    try:
        initialize_database()
        save_provider(
            "compatible",
            "test-secret-key",
            "https://provider.example/v1",
            "persistent-chat-model",
            "persistent-image-model",
        )

        # Each repository call opens a new connection, as it does after restart.
        assert get_provider_credentials("compatible") == (
            "test-secret-key",
            "https://provider.example/v1",
            "persistent-chat-model",
            "persistent-image-model",
        )
        configuration = public_configuration("compatible")
        assert configuration["configured"] is True
        assert configuration["active"] is True
        assert configuration["source"] == "database"
    finally:
        object.__setattr__(settings, "database_path", original_database)
        object.__setattr__(settings, "encryption_key_path", original_key)


def test_chat_history_survives_new_database_connections(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_database = settings.database_path
    object.__setattr__(settings, "database_path", tmp_path / "chat.db")

    class FakeCompletions:
        async def create(self, **kwargs):
            async def chunks():
                yield type(
                    "Chunk",
                    (),
                    {
                        "choices": [
                            type(
                                "Choice",
                                (),
                                {"delta": type("Delta", (), {"content": "Saved reply"})()},
                            )()
                        ]
                    },
                )()

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {
                    "chat": type(
                        "Chat", (), {"completions": FakeCompletions()}
                    )()
                },
            )(),
            "model",
            "",
        ),
    )

    try:
        initialize_database()
        events = "".join(
            asyncio.run(_collect(stream_chat(ChatRequest(message="Keep this chat"))))
        )
        conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]

        initialize_database()
        conversation = get_conversation(conversation_id)

        assert conversation is not None
        assert [message["content"] for message in conversation["messages"]] == [
            "Keep this chat",
            "Saved reply",
        ]
    finally:
        object.__setattr__(settings, "database_path", original_database)


def test_partial_assistant_response_is_saved_when_stream_fails(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_database = settings.database_path
    object.__setattr__(settings, "database_path", tmp_path / "chat.db")

    class FailingCompletions:
        async def create(self, **kwargs):
            async def chunks():
                yield type(
                    "Chunk",
                    (),
                    {
                        "choices": [
                            type(
                                "Choice",
                                (),
                                {"delta": type("Delta", (), {"content": "Partial reply"})()},
                            )()
                        ]
                    },
                )()
                raise RuntimeError("provider disconnected")

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {
                    "chat": type(
                        "Chat", (), {"completions": FailingCompletions()}
                    )()
                },
            )(),
            "model",
            "",
        ),
    )

    try:
        initialize_database()
        events = "".join(
            asyncio.run(_collect(stream_chat(ChatRequest(message="Do not lose it"))))
        )
        conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
        conversation = get_conversation(conversation_id)

        assert conversation is not None
        assert conversation["messages"][-1]["content"] == "Partial reply"
        assert '"type": "error"' in events
    finally:
        object.__setattr__(settings, "database_path", original_database)


def test_core_routes_are_registered() -> None:
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    assert "/api/chat" in paths
    assert "/api/images" in paths
    assert "/api/providers/activate" in paths
    assert "/api/conversations/{conversation_id}" in paths


def test_app_entrypoint_remains_small() -> None:
    with open("app.py", encoding="utf-8") as entrypoint:
        lines = [line for line in entrypoint if line.strip()]
    assert len(lines) <= 6


def test_dalle_three_converts_auto_quality(monkeypatch: pytest.MonkeyPatch) -> None:
    received: dict[str, str] = {}

    class FakeImages:
        async def generate(self, **kwargs: str):
            received.update(kwargs)
            return type("Result", (), {"data": [type("Image", (), {"b64_json": "abc", "url": None, "revised_prompt": None})()]})()

    monkeypatch.setattr(images, "client_for", lambda _: (type("Client", (), {"images": FakeImages()})(), "", "dall-e-3"))
    result = asyncio.run(
        images.generate_image(ImageRequest(prompt="blue circle", model="dall-e-3"))
    )

    assert received["quality"] == "standard"
    assert result["url"] == "data:image/png;base64,abc"


def test_invalid_image_api_key_returns_actionable_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeImages:
        async def generate(self, **kwargs: str):
            raise RuntimeError("Error code: 401 - invalid_api_key")

    monkeypatch.setattr(images, "client_for", lambda _: (type("Client", (), {"images": FakeImages()})(), "", "gpt-image-1"))

    with pytest.raises(HTTPException, match="Create a new A6API key") as error:
        asyncio.run(images.generate_image(ImageRequest(prompt="blue circle")))
    assert error.value.status_code == 401


def test_generated_image_is_saved_to_local_storage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    encoded = base64.b64encode(b"test-image-bytes").decode()

    async def fake_generate(_request):
        return {
            "url": f"data:image/png;base64,{encoded}",
            "revised_prompt": "football on grass",
        }

    monkeypatch.setattr(images, "generate_image", fake_generate)

    result = asyncio.run(
        images.generate_and_store_image(ImageRequest(prompt="Create a football image"))
    )
    stored = settings.root / "data" / "generated" / result["filename"]
    try:
        assert stored.read_bytes() == b"test-image-bytes"
        assert result["url"].startswith("/generated/")
    finally:
        stored.unlink(missing_ok=True)


def test_chat_image_request_uses_image_tool_and_saves_history(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_image_tool(_request):
        return {"url": "/generated/football.png", "filename": "football.png"}

    monkeypatch.setattr(
        "backend.services.chat.generate_and_store_image", fake_image_tool
    )
    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: pytest.fail("Image request should not call the chat model"),
    )

    events = "".join(
        asyncio.run(
            _collect(stream_chat(ChatRequest(message="football image create kr do")))
        )
    )
    conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
    conversation = get_conversation(conversation_id)

    assert "/generated/football.png" in events
    assert conversation is not None
    assert conversation["messages"][-1]["content"].startswith(
        "![Generated image](/generated/football.png)"
    )


def test_chat_respects_disabled_image_generation_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "backend.services.chat.generate_and_store_image",
        lambda _: pytest.fail("Disabled image tool must not be called"),
    )
    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: pytest.fail("Image intent must not fall through to the model"),
    )

    events = "".join(
        asyncio.run(
            _collect(
                stream_chat(
                    ChatRequest(
                        message="football image create kr do",
                        allow_image_generation=False,
                    )
                )
            )
        )
    )

    assert "Image generation is disabled" in events
    assert '"type": "done"' in events


def test_non_image_chat_provider_uses_configured_image_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    save_provider(
        "openai",
        "test-image-key",
        None,
        "gpt-4.1-mini",
        "gpt-image-1",
    )
    assert resolve_image_provider("anthropic") == "openai"

    received: dict = {}

    async def fake_image_tool(request):
        received["request"] = request
        return {"url": "/generated/claude-image.png", "filename": "claude-image.png"}

    monkeypatch.setattr(
        "backend.services.chat.generate_and_store_image", fake_image_tool
    )
    events = "".join(
        asyncio.run(
            _collect(
                stream_chat(
                    ChatRequest(
                        message="mujhe football ki image bna k do",
                        provider="anthropic",
                    )
                )
            )
        )
    )

    assert received["request"].provider == "anthropic"
    assert "/generated/claude-image.png" in events


def test_chat_forwards_image_and_file_attachments(monkeypatch: pytest.MonkeyPatch) -> None:
    received: dict = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            received.update(kwargs)
            async def chunks():
                yield type("Chunk", (), {"choices": []})()
            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (type("Client", (), {"chat": type("Chat", (), {"completions": FakeCompletions()})()})(), "model", ""),
    )
    request = ChatRequest(
        message="Review these files",
        attachments=[
            {"name": "notes.txt", "type": "text/plain", "size": 5, "text": "important note"},
            {"name": "photo.png", "type": "image/png", "size": 4, "data_url": "data:image/png;base64,AAAA"},
            {"name": "report.bin", "type": "application/octet-stream", "size": 4, "data_url": "data:application/octet-stream;base64,AAAA"},
        ],
    )

    events = "".join(asyncio.run(_collect(stream_chat(request))))

    content = received["messages"][-1]["content"]
    assert any(part["type"] == "text" and "important note" in part["text"] for part in content)
    assert any(part["type"] == "image_url" for part in content)
    assert any(part["type"] == "file" and part["file"]["filename"] == "report.bin" for part in content)
    conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
    conversation = get_conversation(conversation_id)
    assert conversation is not None
    assert [item["name"] for item in conversation["messages"][0]["attachments"]] == [
        "notes.txt",
        "photo.png",
        "report.bin",
    ]
    first_attachment = conversation["messages"][0]["attachments"][0]
    assert "data_url" not in first_attachment
    assert first_attachment["url"].startswith("/attachments/")
    assert (
        settings.root / "data" / "attachments" / first_attachment["stored_name"]
    ).is_file()


def test_attachment_only_message_is_persisted(monkeypatch: pytest.MonkeyPatch) -> None:
    received: dict = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            received.update(kwargs)

            async def chunks():
                yield type("Chunk", (), {"choices": []})()

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {
                    "chat": type(
                        "Chat", (), {"completions": FakeCompletions()}
                    )()
                },
            )(),
            "model",
            "",
        ),
    )
    request = ChatRequest(
        message="",
        attachments=[
            {
                "name": "empty-message.txt",
                "type": "text/plain",
                "size": 5,
                "data_url": "data:text/plain;base64,aGVsbG8=",
            }
        ],
    )

    events = "".join(asyncio.run(_collect(stream_chat(request))))
    conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
    conversation = get_conversation(conversation_id)

    assert conversation is not None
    assert conversation["title"] == "empty-message.txt"
    assert conversation["messages"][0]["content"] == ""
    assert conversation["messages"][0]["attachments"][0]["name"] == "empty-message.txt"
    assert received["messages"][-1]["content"][1]["text"].endswith("hello")


def test_storage_manager_deletes_individual_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeCompletions:
        async def create(self, **kwargs):
            async def chunks():
                yield type("Chunk", (), {"choices": []})()

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {
                    "chat": type(
                        "Chat", (), {"completions": FakeCompletions()}
                    )()
                },
            )(),
            "model",
            "",
        ),
    )
    events = "".join(
        asyncio.run(
            _collect(
                stream_chat(
                    ChatRequest(
                        attachments=[
                            {
                                "name": "delete-me.txt",
                                "type": "text/plain",
                                "size": 5,
                                "data_url": "data:text/plain;base64,aGVsbG8=",
                            }
                        ]
                    )
                )
            )
        )
    )
    conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
    conversation = get_conversation(conversation_id)
    stored_name = conversation["messages"][0]["attachments"][0]["stored_name"]

    summary = client.get("/api/storage")
    assert summary.status_code == 200
    assert summary.json()["attachments_size"] == 5
    assert summary.json()["warning_threshold"] == 5 * 1024 * 1024 * 1024
    assert summary.json()["warning"] is False

    deleted = client.delete(f"/api/storage/attachments/{stored_name}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert get_conversation(conversation_id)["messages"][0]["attachments"] == []


def test_deleting_conversation_removes_its_attachment_file(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeCompletions:
        async def create(self, **kwargs):
            async def chunks():
                yield type("Chunk", (), {"choices": []})()

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {
                    "chat": type(
                        "Chat", (), {"completions": FakeCompletions()}
                    )()
                },
            )(),
            "model",
            "",
        ),
    )
    events = "".join(
        asyncio.run(
            _collect(
                stream_chat(
                    ChatRequest(
                        message="Keep cleanup consistent",
                        attachments=[
                            {
                                "name": "cascade.txt",
                                "type": "text/plain",
                                "size": 5,
                                "data_url": "data:text/plain;base64,aGVsbG8=",
                            }
                        ],
                    )
                )
            )
        )
    )
    conversation_id = events.split('"conversation_id": "', 1)[1].split('"', 1)[0]
    conversation = get_conversation(conversation_id)
    stored_name = conversation["messages"][0]["attachments"][0]["stored_name"]
    stored_path = settings.root / "data" / "attachments" / stored_name
    assert stored_path.is_file()

    response = client.delete(f"/api/conversations/{conversation_id}")

    assert response.status_code == 204
    assert not stored_path.exists()
    assert get_conversation(conversation_id) is None


def test_chat_extracts_docx_attachment(monkeypatch: pytest.MonkeyPatch) -> None:
    received: dict = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            received.update(kwargs)
            async def chunks():
                yield type("Chunk", (), {"choices": []})()
            return chunks()

    document_xml = b'''<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX secret text</w:t></w:r></w:p></w:body></w:document>'''
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as archive:
        archive.writestr("word/document.xml", document_xml)
    data_url = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64," + base64.b64encode(docx.getvalue()).decode()
    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (type("Client", (), {"chat": type("Chat", (), {"completions": FakeCompletions()})()})(), "model", ""),
    )

    list(asyncio.run(_collect(stream_chat(ChatRequest(message="Read it", attachments=[{"name": "brief.docx", "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": len(docx.getvalue()), "data_url": data_url}])))))

    content = received["messages"][-1]["content"]
    assert any(part["type"] == "text" and "DOCX secret text" in part["text"] for part in content)


def test_chat_emits_whatsapp_browser_action_without_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: pytest.fail("Browser action should not call the model provider"),
    )

    events = "".join(asyncio.run(_collect(stream_chat(ChatRequest(message="web p whatsapp open kro")))))

    assert '"type": "browser_action"' in events
    assert '"url": "https://web.whatsapp.com/"' in events
    assert "Opening [WhatsApp Web]" in events


def test_chat_respects_disabled_browser_action_permission(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider_called = False

    class FakeCompletions:
        async def create(self, **kwargs):
            nonlocal provider_called
            provider_called = True

            async def chunks():
                yield type("Chunk", (), {"choices": []})()

            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (
            type(
                "Client",
                (),
                {"chat": type("Chat", (), {"completions": FakeCompletions()})()},
            )(),
            "model",
            "",
        ),
    )

    events = "".join(
        asyncio.run(
            _collect(
                stream_chat(
                    ChatRequest(
                        message="open whatsapp",
                        allow_browser_actions=False,
                    )
                )
            )
        )
    )

    assert provider_called
    assert '"type": "browser_action"' not in events


def test_chat_does_not_open_non_http_url(monkeypatch: pytest.MonkeyPatch) -> None:
    provider_called = False

    class FakeCompletions:
        async def create(self, **kwargs):
            nonlocal provider_called
            provider_called = True
            async def chunks():
                yield type("Chunk", (), {"choices": []})()
            return chunks()

    monkeypatch.setattr(
        "backend.services.chat.client_for",
        lambda _: (type("Client", (), {"chat": type("Chat", (), {"completions": FakeCompletions()})()})(), "model", ""),
    )

    events = "".join(asyncio.run(_collect(stream_chat(ChatRequest(message="open javascript:alert(1)")))))

    assert provider_called
    assert '"type": "browser_action"' not in events


async def _collect(iterator):
    return [item async for item in iterator]
