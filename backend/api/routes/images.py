from fastapi import APIRouter

from backend.schemas.chat import ImageRequest
from backend.services.images import generate_image

router = APIRouter(tags=["images"])


@router.post("/images")
async def images(request: ImageRequest) -> dict:
    return await generate_image(request)
