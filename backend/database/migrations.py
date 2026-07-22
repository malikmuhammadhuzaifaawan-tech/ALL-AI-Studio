from backend.database.connection import connect


def initialize_database() -> None:
    with connect() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                attachments_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS provider_settings (
                provider TEXT PRIMARY KEY,
                api_key TEXT NOT NULL,
                base_url TEXT,
                chat_model TEXT NOT NULL,
                image_model TEXT,
                active INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                temperature REAL NOT NULL DEFAULT 0.7,
                max_tokens INTEGER NOT NULL DEFAULT 4096,
                top_p REAL NOT NULL DEFAULT 1,
                streaming INTEGER NOT NULL DEFAULT 1,
                theme TEXT NOT NULL DEFAULT 'system',
                system_prompt TEXT NOT NULL DEFAULT ''
            );
            INSERT OR IGNORE INTO preferences(id) VALUES (1);
            CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id, id);
            CREATE INDEX IF NOT EXISTS idx_conversations_updated
                ON conversations(pinned DESC, updated_at DESC);
            """
        )
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(conversations)")
        }
        if "pinned" not in columns:
            connection.execute(
                "ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
            )
        message_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(messages)")
        }
        if "attachments_json" not in message_columns:
            connection.execute(
                "ALTER TABLE messages ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'"
            )
