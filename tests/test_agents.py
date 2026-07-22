from pathlib import Path
from dataclasses import replace
from tempfile import TemporaryDirectory

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.core.config import settings
from backend.schemas.chat import ChatRequest
from backend.services.agents import agent_prompt, parse_tool_call
from backend.services import workspace_tools
from backend.services.workspace_tools import (
    execute_workspace_tool,
    list_workspace,
    read_workspace_file,
    search_workspace,
)


def test_agent_prompts_and_tool_envelope():
    assert "workspace-scoped tools" in agent_prompt("coder").lower()
    assert "production-ready" in agent_prompt("designer")
    assert parse_tool_call('<tool_call>{"name":"list_files","arguments":{}}</tool_call>') == (
        "list_files",
        {},
    )
    assert parse_tool_call("normal answer") is None


def test_chat_request_only_accepts_implemented_agents():
    assert ChatRequest(message="hello", agent="designer").agent == "designer"
    assert ChatRequest(message="hello", agent="coder").agent == "coder"
    with pytest.raises(ValidationError):
        ChatRequest(message="hello", agent="researcher")


def test_workspace_tools_are_bounded_and_root_scoped(monkeypatch):
    with TemporaryDirectory() as directory:
        tmp_path = Path(directory)
        monkeypatch.setattr(workspace_tools, "settings", replace(settings, root=tmp_path))
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "demo.py").write_text("alpha\nbeta\n", encoding="utf-8")
        assert read_workspace_file("src/demo.py")["content"] == "1 | alpha\n2 | beta"
        assert search_workspace("beta")["matches"][0]["path"] == "src/demo.py"
        assert "src/" in list_workspace(".")["entries"]
        with pytest.raises(HTTPException, match="escapes"):
            read_workspace_file("../outside.txt")
        with pytest.raises(HTTPException, match="protected"):
            execute_workspace_tool("read_file", {"path": ".env"})


def test_workspace_write_requires_explicit_overwrite(monkeypatch):
    with TemporaryDirectory() as directory:
        tmp_path = Path(directory)
        monkeypatch.setattr(workspace_tools, "settings", replace(settings, root=tmp_path))
        target = tmp_path / "note.txt"
        target.write_text("before", encoding="utf-8")
        with pytest.raises(HTTPException, match="overwrite"):
            execute_workspace_tool("write_file", {"path": "note.txt", "content": "after"})
        result = execute_workspace_tool(
            "write_file", {"path": "note.txt", "content": "after", "overwrite": True}
        )
        assert result["created"] is False
        assert target.read_text(encoding="utf-8") == "after"