from fastapi import APIRouter

from backend.api.routes import (
    chat,
    config,
    conversations,
    health,
    images,
    preferences,
    providers,
    storage,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(config.router, prefix="/api")
api_router.include_router(providers.router, prefix="/api")
api_router.include_router(conversations.router, prefix="/api")
api_router.include_router(preferences.router, prefix="/api")
api_router.include_router(chat.router, prefix="/api")
api_router.include_router(images.router, prefix="/api")
api_router.include_router(storage.router, prefix="/api")
