import base64
import binascii
import json
import mimetypes
import re
import uuid
from pathlib import Path

from fastapi import HTTPException

from backend.core.config import settings
from backend.database import connect
from backend.schemas.chat import Attachment

ATTACHMENTS_DIRECTORY = "attachments"
GENERATED_DIRECTORY = "generated"
STORAGE_WARNING_BYTES = 5 * 1024 * 1024 * 1024


def storage_directory(category: str) -> Path:
    if category not in {ATTACHMENTS_DIRECTORY, GENERATED_DIRECTORY}:
        raise HTTPException(400, "Invalid storage category")
    directory = settings.root / "data" / category
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def persist_attachments(attachments: list[Attachment]) -> list[dict]:
    stored: list[dict] = []
    directory = storage_directory(ATTACHMENTS_DIRECTORY)
    for attachment in attachments:
        if attachment.data_url:
            try:
                _, encoded = attachment.data_url.split(",", 1)
                content = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error) as exc:
                raise HTTPException(400, f"Invalid attachment: {attachment.name}") from exc
        elif attachment.text is not None:
            content = attachment.text.encode("utf-8")
        else:
            raise HTTPException(400, f"Attachment data missing: {attachment.name}")
        suffix = Path(attachment.name).suffix.lower()[:12]
        if not re.fullmatch(r"\.[a-z0-9]+", suffix):
            suffix = mimetypes.guess_extension(attachment.type) or ".bin"
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        (directory / stored_name).write_bytes(content)
        stored.append(
            {
                "name": attachment.name,
                "type": attachment.type,
                "size": len(content),
                "stored_name": stored_name,
                "url": f"/attachments/{stored_name}",
                "text": attachment.text,
            }
        )
    return stored


def migrate_inline_attachments() -> int:
    migrated = 0
    with connect() as connection:
        rows = connection.execute("SELECT id, attachments_json FROM messages").fetchall()
        for row in rows:
            items = json.loads(row["attachments_json"] or "[]")
            if not any(item.get("data_url") for item in items):
                continue
            converted = []
            for item in items:
                if item.get("data_url"):
                    converted.extend(
                        persist_attachments([Attachment.model_validate(item)])
                    )
                    migrated += 1
                else:
                    converted.append(item)
            connection.execute(
                "UPDATE messages SET attachments_json = ? WHERE id = ?",
                (json.dumps(converted), row["id"]),
            )
    return migrated


def hydrate_attachment(item: dict) -> Attachment:
    if item.get("data_url"):
        return Attachment.model_validate(item)
    stored_name = _safe_name(item.get("stored_name", ""))
    path = storage_directory(ATTACHMENTS_DIRECTORY) / stored_name
    if not path.is_file():
        raise HTTPException(410, f"Stored attachment is missing: {item.get('name', stored_name)}")
    mime = item.get("type") or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode()
    return Attachment(
        name=item.get("name", stored_name),
        type=mime,
        size=path.stat().st_size,
        data_url=f"data:{mime};base64,{encoded}",
        text=item.get("text"),
    )


def storage_summary() -> dict:
    files = []
    totals = {ATTACHMENTS_DIRECTORY: 0, GENERATED_DIRECTORY: 0}
    for category in totals:
        for path in storage_directory(category).iterdir():
            if not path.is_file():
                continue
            size = path.stat().st_size
            totals[category] += size
            files.append(
                {
                    "category": category,
                    "name": path.name,
                    "size": size,
                    "url": f"/{category}/{path.name}",
                    "updated_at": path.stat().st_mtime,
                }
            )
    database_size = sum(
        path.stat().st_size
        for path in settings.database_path.parent.glob(f"{settings.database_path.name}*")
        if path.is_file()
    )
    files.sort(key=lambda item: item["updated_at"], reverse=True)
    total_size = database_size + sum(totals.values())
    return {
        "database_size": database_size,
        "attachments_size": totals[ATTACHMENTS_DIRECTORY],
        "generated_size": totals[GENERATED_DIRECTORY],
        "total_size": total_size,
        "warning_threshold": STORAGE_WARNING_BYTES,
        "warning": total_size >= STORAGE_WARNING_BYTES,
        "files": files,
    }


def delete_stored_file(category: str, name: str) -> bool:
    safe_name = _safe_name(name)
    path = storage_directory(category) / safe_name
    existed = path.is_file()
    if existed:
        path.unlink()
    _remove_references(category, {safe_name})
    return existed


def delete_all_stored_files() -> int:
    removed = 0
    for category in (ATTACHMENTS_DIRECTORY, GENERATED_DIRECTORY):
        names = {path.name for path in storage_directory(category).iterdir() if path.is_file()}
        for name in names:
            (storage_directory(category) / name).unlink(missing_ok=True)
            removed += 1
        _remove_references(category, names)
    return removed


def cleanup_storage() -> dict:
    attachment_refs, generated_refs = _referenced_files()
    removed = 0
    for category, referenced in (
        (ATTACHMENTS_DIRECTORY, attachment_refs),
        (GENERATED_DIRECTORY, generated_refs),
    ):
        for path in storage_directory(category).iterdir():
            if path.is_file() and path.name not in referenced:
                path.unlink()
                removed += 1
    with connect() as connection:
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    with connect() as connection:
        connection.execute("VACUUM")
    return {"removed": removed}


def _referenced_files() -> tuple[set[str], set[str]]:
    attachments: set[str] = set()
    generated: set[str] = set()
    with connect() as connection:
        rows = connection.execute("SELECT attachments_json, content FROM messages").fetchall()
    for row in rows:
        for item in json.loads(row["attachments_json"] or "[]"):
            if item.get("stored_name"):
                attachments.add(item["stored_name"])
        generated.update(re.findall(r"/generated/([a-f0-9]+\.[a-z0-9]+)", row["content"]))
    return attachments, generated


def _remove_references(category: str, names: set[str]) -> None:
    if not names:
        return
    with connect() as connection:
        rows = connection.execute("SELECT id, attachments_json, content FROM messages").fetchall()
        for row in rows:
            if category == ATTACHMENTS_DIRECTORY:
                items = json.loads(row["attachments_json"] or "[]")
                filtered = [item for item in items if item.get("stored_name") not in names]
                if len(filtered) != len(items):
                    connection.execute(
                        "UPDATE messages SET attachments_json = ? WHERE id = ?",
                        (json.dumps(filtered), row["id"]),
                    )
            else:
                content = row["content"]
                for name in names:
                    content = re.sub(
                        rf"!?\[[^\]]*\]\(/generated/{re.escape(name)}\)\s*",
                        "",
                        content,
                    )
                if content != row["content"]:
                    connection.execute(
                        "UPDATE messages SET content = ? WHERE id = ?",
                        (content.strip(), row["id"]),
                    )


def _safe_name(name: str) -> str:
    if not name or Path(name).name != name:
        raise HTTPException(400, "Invalid file name")
    return name
