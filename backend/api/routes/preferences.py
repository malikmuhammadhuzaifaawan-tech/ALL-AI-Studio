from fastapi import APIRouter

from backend.repositories.preferences import get_preferences, save_preferences
from backend.schemas.preferences import PreferencesRequest

router = APIRouter(prefix="/preferences", tags=["preferences"])


@router.get("")
async def get_all() -> dict:
    return get_preferences()


@router.put("")
async def save(request: PreferencesRequest) -> dict:
    save_preferences(request)
    return {"ok": True}
