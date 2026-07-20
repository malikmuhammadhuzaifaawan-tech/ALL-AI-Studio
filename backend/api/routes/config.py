from fastapi import APIRouter

from backend.core.providers import PROVIDERS
from backend.repositories.providers import public_configuration

router = APIRouter(tags=["configuration"])


@router.get("/config")
async def configuration() -> dict:
    providers = {item.id: public_configuration(item.id) for item in PROVIDERS}
    active_provider = next(
        (provider for provider, config in providers.items() if config["active"]),
        "openai",
    )
    return {"providers": providers, "active_provider": active_provider}
