import sqlite3
import json
import uuid

from backend.database import connect


def list_conversations() -> list[dict]:
    with connect() as connection:
        rows = connection.execute(
            """SELECT id, title, pinned, created_at, updated_at
               FROM conversations ORDER BY pinned DESC, updated_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversation(conversation_id: str) -> dict | None:
    with connect() as connection:
        conversation = connection.execute(
            "SELECT * FROM conversations WHERE id = ?", (conversation_id,)
        ).fetchone()
        if not conversation:
            return None
        messages = connection.execute(
            """SELECT role, content, attachments_json, created_at FROM messages
               WHERE conversation_id = ? ORDER BY id""",
            (conversation_id,),
        ).fetchall()
    serialized = []
    for row in messages:
        message = dict(row)
        message["attachments"] = json.loads(message.pop("attachments_json") or "[]")
        serialized.append(message)
    return {**dict(conversation), "messages": serialized}


def delete_conversation(conversation_id: str) -> bool:
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM conversations WHERE id = ?", (conversation_id,)
        )
    return bool(cursor.rowcount)


def update_conversation(
    conversation_id: str, *, title: str | None, pinned: bool | None
) -> dict | None:
    updates: list[str] = []
    values: list[str | int] = []
    if title is not None:
        updates.append("title = ?")
        values.append(title.strip())
    if pinned is not None:
        updates.append("pinned = ?")
        values.append(int(pinned))
    if not updates:
        raise ValueError("No changes supplied")
    values.append(conversation_id)
    with connect() as connection:
        cursor = connection.execute(
            f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?", values
        )
        if not cursor.rowcount:
            return None
        row = connection.execute(
            """SELECT id, title, pinned, created_at, updated_at
               FROM conversations WHERE id = ?""",
            (conversation_id,),
        ).fetchone()
    return dict(row) if row else None


def add_user_message(
    conversation_id: str | None, content: str, attachments: list[dict] | None = None
) -> tuple[str, list[sqlite3.Row]]:
    identifier = conversation_id or str(uuid.uuid4())
    stored_attachments = attachments or []
    with connect() as connection:
        existing = connection.execute(
            "SELECT id FROM conversations WHERE id = ?", (identifier,)
        ).fetchone()
        if not existing:
            title = content.strip().replace("\n", " ")[:54]
            if not title and stored_attachments:
                title = stored_attachments[0].get("name", "Attached file")[:54]
            title = title or "New conversation"
            connection.execute(
                "INSERT INTO conversations(id, title) VALUES (?, ?)",
                (identifier, title),
            )
        connection.execute(
            """INSERT INTO messages(
                   conversation_id, role, content, attachments_json
               ) VALUES (?, 'user', ?, ?)""",
            (identifier, content, json.dumps(stored_attachments)),
        )
        connection.execute(
            """UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (identifier,),
        )
        history = connection.execute(
            """SELECT role, content, attachments_json FROM messages
               WHERE conversation_id = ?
               ORDER BY id DESC LIMIT 30""",
            (identifier,),
        ).fetchall()[::-1]
    return identifier, history


def add_assistant_message(conversation_id: str, content: str) -> None:
    with connect() as connection:
        connection.execute(
            """INSERT INTO messages(conversation_id, role, content)
               VALUES (?, 'assistant', ?)""",
            (conversation_id, content),
        )
        connection.execute(
            """UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (conversation_id,),
        )
