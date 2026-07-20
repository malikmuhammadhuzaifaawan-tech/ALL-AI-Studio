from fastapi import APIRouter

from backend.core.providers import PROVIDER_IDS

from backend.schemas.provider import ProviderRequest
from backend.services.provider import activate_provider, available_models

router = APIRouter(tags=["providers"])


@router.post("/providers/activate")
async def activate(request: ProviderRequest) -> dict:
    model_count = await activate_provider(request)
    return {
        "ok": True,
        "provider": request.provider,
        "models_found": model_count,
    }


@router.get("/models")
async def models(
    provider: str = "openai",
) -> dict:
    if provider not in PROVIDER_IDS:
        return {"models": []}
    return {"models": await available_models(provider)}
