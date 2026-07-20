from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.schemas.chat import ChatRequest
from backend.services.chat import stream_chat

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat(request: ChatRequest) -> StreamingResponse:
    return StreamingResponse(
        stream_chat(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
