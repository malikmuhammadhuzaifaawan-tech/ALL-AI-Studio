from pydantic import BaseModel, Field, field_validator, model_validator

from backend.core.providers import PROVIDER_IDS


def _supported_provider(provider: str) -> str:
    if provider not in PROVIDER_IDS:
        raise ValueError(f"Unsupported provider: {provider}")
    return provider


class Attachment(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=0, le=8 * 1024 * 1024)
    data_url: str | None = Field(default=None, max_length=12 * 1024 * 1024)
    text: str | None = Field(default=None, max_length=100_000)


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    message: str = Field(default="", max_length=50000)
    provider: str = Field(default="openai", min_length=1, max_length=50)
    model: str | None = None
    system_prompt: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    image: str | None = None
    allow_browser_actions: bool = True
    allow_image_generation: bool = True
    attachments: list[Attachment] = Field(default_factory=list, max_length=8)

    _validate_provider = field_validator("provider")(_supported_provider)

    @model_validator(mode="after")
    def require_message_or_attachment(self):
        if not self.message.strip() and not self.attachments and not self.image:
            raise ValueError("A message or attachment is required")
        return self


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=32000)
    provider: str = Field(default="openai", min_length=1, max_length=50)
    model: str | None = None
    size: str = "1024x1024"
    quality: str = "auto"

    _validate_provider = field_validator("provider")(_supported_provider)
