from backend.core.config import provider_environment
from backend.core.providers import PROVIDERS, provider_definition
from backend.core.security import decrypt_secret, encrypt_secret
from backend.database import connect


def get_provider_credentials(provider: str) -> tuple[str, str | None, str, str]:
    with connect() as connection:
        row = connection.execute(
            """SELECT api_key, base_url, chat_model, image_model
               FROM provider_settings WHERE provider = ?""",
            (provider,),
        ).fetchone()
    if row:
        return (
            decrypt_secret(row["api_key"]),
            row["base_url"] or None,
            row["chat_model"],
            row["image_model"] or "",
        )
    return provider_environment(provider)


def save_provider(
    provider: str,
    api_key: str,
    base_url: str | None,
    chat_model: str,
    image_model: str | None,
) -> None:
    with connect() as connection:
        connection.execute("UPDATE provider_settings SET active = 0")
        connection.execute(
            """INSERT INTO provider_settings(
                   provider, api_key, base_url, chat_model, image_model, active
               ) VALUES (?, ?, ?, ?, ?, 1)
               ON CONFLICT(provider) DO UPDATE SET
                   api_key=excluded.api_key,
                   base_url=excluded.base_url,
                   chat_model=excluded.chat_model,
                   image_model=excluded.image_model,
                   active=1,
                   updated_at=CURRENT_TIMESTAMP""",
            (
                provider,
                encrypt_secret(api_key),
                base_url,
                chat_model,
                image_model or "",
            ),
        )


def public_configuration(provider: str) -> dict:
    with connect() as connection:
        row = connection.execute(
            """SELECT base_url, chat_model, image_model, active
               FROM provider_settings WHERE provider = ?""",
            (provider,),
        ).fetchone()
    if row:
        return {
            "configured": True,
            "active": bool(row["active"]),
            "source": "database",
            "base_url": row["base_url"] or "",
            "chat_model": row["chat_model"],
            "image_model": row["image_model"] or "",
        }
    key, base_url, chat_model, image_model = provider_environment(provider)
    return {
        "configured": bool(key),
        "active": False,
        "source": "environment",
        "base_url": base_url or "",
        "chat_model": chat_model,
        "image_model": image_model,
    }


def resolve_image_provider(requested_provider: str) -> str:
    """Choose an image-capable configured provider independently of chat."""
    if provider_definition(requested_provider).supports_images:
        return requested_provider
    candidates = (requested_provider,) + tuple(
        provider.id for provider in PROVIDERS if provider.id != requested_provider
    )
    for provider in candidates:
        if not provider_definition(provider).supports_images:
            continue
        api_key, _, _, image_model = get_provider_credentials(provider)
        if api_key and image_model:
            return provider
    raise ValueError(
        "No image provider is configured. Configure OpenAI or an image-capable "
        "OpenAI-compatible provider with an image model in Settings."
    )
