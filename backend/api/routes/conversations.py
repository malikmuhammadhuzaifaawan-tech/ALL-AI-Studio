from fastapi import APIRouter, HTTPException, Response, status

from backend.repositories.conversations import (
    delete_conversation,
    get_conversation,
    list_conversations,
    update_conversation,
)
from backend.schemas.conversation import ConversationPatch
from backend.services.storage import delete_stored_file

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("")
async def list_all() -> list[dict]:
    return list_conversations()


@router.get("/{conversation_id}")
async def get_one(conversation_id: str) -> dict:
    conversation = get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    return conversation


@router.patch("/{conversation_id}")
async def update(
    conversation_id: str, request: ConversationPatch
) -> dict:
    try:
        conversation = update_conversation(
            conversation_id, title=request.title, pinned=request.pinned
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    return conversation


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(conversation_id: str) -> Response:
    conversation = get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(404, "Conversation not found")
    attachment_names = {
        attachment["stored_name"]
        for message in conversation["messages"]
        for attachment in message.get("attachments", [])
        if attachment.get("stored_name")
    }
    delete_conversation(conversation_id)
    for name in attachment_names:
        delete_stored_file("attachments", name)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
