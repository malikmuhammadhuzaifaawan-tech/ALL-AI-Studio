from fastapi import APIRouter

from backend.services.storage import (
    cleanup_storage,
    delete_all_stored_files,
    delete_stored_file,
    storage_summary,
)

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("")
async def summary() -> dict:
    return storage_summary()


@router.delete("/{category}/{name}")
async def remove(category: str, name: str) -> dict:
    return {"deleted": delete_stored_file(category, name)}


@router.post("/cleanup")
async def cleanup() -> dict:
    return cleanup_storage()


@router.delete("")
async def remove_all() -> dict:
    return {"removed": delete_all_stored_files()}
