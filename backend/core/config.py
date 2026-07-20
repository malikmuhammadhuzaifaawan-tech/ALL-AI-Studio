import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from backend.core.providers import provider_definition

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "AI Studio")
    root: Path = ROOT
    database_path: Path = ROOT / "data" / "chat.db"
    encryption_key_path: Path = ROOT / "data" / ".secret.key"
    allowed_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    )


settings = Settings()


def provider_environment(provider: str) -> tuple[str, str | None, str, str]:
    definition = provider_definition(provider)
    prefix = provider.upper().replace("-", "_")
    api_key = os.getenv(f"{prefix}_API_KEY", "").strip()
    base_url = os.getenv(f"{prefix}_BASE_URL", definition.default_base_url).strip() or None
    chat_model = os.getenv(f"{prefix}_CHAT_MODEL", definition.default_chat_model)
    image_model = os.getenv(f"{prefix}_IMAGE_MODEL", definition.default_image_model)
    return api_key, base_url, chat_model, image_model
