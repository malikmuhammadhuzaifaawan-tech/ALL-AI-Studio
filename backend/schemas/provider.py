from pydantic import BaseModel, Field

from backend.core.providers import PROVIDER_IDS


class ProviderRequest(BaseModel):
    provider: str = Field(min_length=1, max_length=50)
    api_key: str = Field(min_length=5, max_length=1000)
    base_url: str | None = Field(default=None, max_length=2000)
    chat_model: str = Field(min_length=1, max_length=300)
    image_model: str | None = Field(default=None, max_length=300)

    def model_post_init(self, __context: object) -> None:
        if self.provider not in PROVIDER_IDS:
            raise ValueError(f"Unsupported provider: {self.provider}")
