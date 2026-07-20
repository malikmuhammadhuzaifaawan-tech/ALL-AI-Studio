from backend.database import connect
from backend.schemas.preferences import PreferencesRequest


def get_preferences() -> dict:
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM preferences WHERE id = 1"
        ).fetchone()
    result = dict(row)
    result["streaming"] = bool(result["streaming"])
    return result


def save_preferences(preferences: PreferencesRequest) -> None:
    with connect() as connection:
        connection.execute(
            """UPDATE preferences SET temperature=?, max_tokens=?, top_p=?,
               streaming=?, theme=?, system_prompt=? WHERE id=1""",
            (
                preferences.temperature,
                preferences.max_tokens,
                preferences.top_p,
                int(preferences.streaming),
                preferences.theme,
                preferences.system_prompt,
            ),
        )
