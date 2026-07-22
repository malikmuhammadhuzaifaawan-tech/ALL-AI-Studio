import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from backend.core.config import settings

MAX_TOOL_RESULT_CHARS = 100_000
MAX_WRITE_CHARS = 500_000
MAX_SEARCH_MATCHES = 100
MAX_LIST_ENTRIES = 500

BLOCKED_PARTS = frozenset(
    {
        ".git",
        ".next",
        ".env",
        ".pytest_cache",
        "__pycache__",
        "data",
        "node_modules",
    }
)
BLOCKED_NAMES = frozenset({".env", ".secret.key"})


def _workspace_path(raw_path: str = ".", *, for_write: bool = False) -> Path:
    if not isinstance(raw_path, str) or "\x00" in raw_path:
        raise HTTPException(400, "Invalid workspace path")
    relative = Path(raw_path.replace("\\", "/"))
    if relative.is_absolute():
        raise HTTPException(403, "Only workspace-relative paths are allowed")
    candidate = (settings.root / relative).resolve()
    try:
        candidate.relative_to(settings.root.resolve())
    except ValueError as exc:
        raise HTTPException(403, "Path escapes the workspace") from exc
    relative_parts = candidate.relative_to(settings.root.resolve()).parts
    if any(part in BLOCKED_PARTS for part in relative_parts) or candidate.name in BLOCKED_NAMES:
        raise HTTPException(403, "This protected path is not available to agents")
    if for_write and candidate.suffix.lower() in {".db", ".sqlite", ".key", ".pem"}:
        raise HTTPException(403, "Agents cannot write secret or database files")
    return candidate


def _relative(path: Path) -> str:
    return path.relative_to(settings.root).as_posix()


def read_workspace_file(path: str, start_line: int = 1, end_line: int | None = None) -> dict[str, Any]:
    target = _workspace_path(path)
    if not target.is_file():
        raise HTTPException(404, "Workspace file not found")
    if target.stat().st_size > 2 * 1024 * 1024:
        raise HTTPException(413, "Agent reads are limited to 2 MB text files")
    try:
        lines = target.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "Agent tools can only read UTF-8 text files") from exc
    first = max(1, int(start_line))
    last = min(len(lines), int(end_line) if end_line is not None else first + 999)
    content = "\n".join(f"{index} | {lines[index - 1]}" for index in range(first, last + 1))
    return {"path": _relative(target), "start_line": first, "end_line": last, "content": content[:MAX_TOOL_RESULT_CHARS]}


def list_workspace(path: str = ".", recursive: bool = False) -> dict[str, Any]:
    target = _workspace_path(path)
    if not target.is_dir():
        raise HTTPException(404, "Workspace directory not found")
    iterator = target.rglob("*") if recursive else target.iterdir()
    entries: list[str] = []
    for item in iterator:
        relative_parts = item.relative_to(settings.root).parts
        if any(part in BLOCKED_PARTS for part in relative_parts) or item.name in BLOCKED_NAMES:
            continue
        entries.append(f"{_relative(item)}{'/' if item.is_dir() else ''}")
        if len(entries) >= MAX_LIST_ENTRIES:
            break
    return {"path": _relative(target) or ".", "entries": sorted(entries), "truncated": len(entries) >= MAX_LIST_ENTRIES}


def search_workspace(query: str, path: str = ".", file_pattern: str = "*") -> dict[str, Any]:
    if not query or len(query) > 500:
        raise HTTPException(400, "Search query must contain 1-500 characters")
    target = _workspace_path(path)
    if not target.is_dir():
        raise HTTPException(404, "Workspace directory not found")
    try:
        pattern = re.compile(query, re.IGNORECASE)
    except re.error as exc:
        raise HTTPException(400, f"Invalid regular expression: {exc}") from exc
    matches: list[dict[str, Any]] = []
    for file in target.rglob(file_pattern):
        relative_parts = file.relative_to(settings.root).parts
        if not file.is_file() or any(part in BLOCKED_PARTS for part in relative_parts):
            continue
        if file.stat().st_size > 2 * 1024 * 1024:
            continue
        try:
            lines = file.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            continue
        for number, line in enumerate(lines, 1):
            if pattern.search(line):
                matches.append({"path": _relative(file), "line": number, "text": line[:1000]})
                if len(matches) >= MAX_SEARCH_MATCHES:
                    return {"matches": matches, "truncated": True}
    return {"matches": matches, "truncated": False}


def write_workspace_file(path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
    if not isinstance(content, str) or len(content) > MAX_WRITE_CHARS:
        raise HTTPException(413, "Agent writes are limited to 500,000 characters")
    target = _workspace_path(path, for_write=True)
    existed = target.exists()
    if existed and not overwrite:
        raise HTTPException(409, "File exists; set overwrite=true after reading it")
    if target.exists() and not target.is_file():
        raise HTTPException(400, "Write target is not a file")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8", newline="")
    return {"path": _relative(target), "characters": len(content), "created": not existed}


def execute_workspace_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    tools = {
        "read_file": read_workspace_file,
        "list_files": list_workspace,
        "search_files": search_workspace,
        "write_file": write_workspace_file,
    }
    operation = tools.get(name)
    if operation is None:
        raise HTTPException(400, f"Unknown workspace tool: {name}")
    try:
        return operation(**arguments)
    except TypeError as exc:
        raise HTTPException(400, f"Invalid arguments for {name}") from exc