from typing import Literal

from pydantic import BaseModel, Field


class PreferencesRequest(BaseModel):
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1, le=131072)
    top_p: float = Field(default=1, ge=0, le=1)
    streaming: bool = True
    theme: Literal["light", "dark", "system"] = "system"
    system_prompt: str = Field(default="", max_length=20000)
