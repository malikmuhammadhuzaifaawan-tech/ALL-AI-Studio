from pydantic import BaseModel, Field


class ConversationPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    pinned: bool | None = None
