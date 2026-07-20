import base64
import json

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

app = FastAPI()

ONE_PIXEL_PNG = base64.b64encode(
    bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc000000401010089990d1d0000000049454e44ae426082")
).decode()


@app.get("/v1/models")
async def models():
    return {"object": "list", "data": [{"id": "mock-chat", "object": "model", "created": 1, "owned_by": "local"}]}


@app.post("/v1/chat/completions")
async def chat(request: Request):
    payload = await request.json()
    if payload.get("stream"):
        async def chunks():
            for text in ("Mock provider ", "streaming works."):
                data = {"id": "chatcmpl-test", "object": "chat.completion.chunk", "created": 1, "model": "mock-chat", "choices": [{"index": 0, "delta": {"content": text}, "finish_reason": None}]}
                yield f"data: {json.dumps(data)}\n\n"
            # Some OpenAI-compatible providers emit a final usage-only chunk.
            yield f"data: {json.dumps({'id': 'chatcmpl-test', 'object': 'chat.completion.chunk', 'choices': [], 'usage': {'total_tokens': 5}})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(chunks(), media_type="text/event-stream")
    return {"id": "chatcmpl-test", "object": "chat.completion", "created": 1, "model": "mock-chat", "choices": [{"index": 0, "message": {"role": "assistant", "content": "Mock provider works."}, "finish_reason": "stop"}]}


@app.post("/v1/images/generations")
async def images():
    return {"created": 1, "data": [{"b64_json": ONE_PIXEL_PNG}]}
