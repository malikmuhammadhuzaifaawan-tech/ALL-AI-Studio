from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.api.router import api_router
from backend.core.config import settings
from backend.database.migrations import initialize_database
from backend.services.storage import migrate_inline_attachments


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()
    migrate_inline_attachments()
    yield


def create_application() -> FastAPI:
    generated_directory = settings.root / "data" / "generated"
    attachments_directory = settings.root / "data" / "attachments"
    generated_directory.mkdir(parents=True, exist_ok=True)
    attachments_directory.mkdir(parents=True, exist_ok=True)
    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(GZipMiddleware, minimum_size=1000)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.include_router(api_router)
    application.mount(
        "/static",
        StaticFiles(directory=settings.root / "static"),
        name="static",
    )
    application.mount(
        "/generated",
        StaticFiles(directory=generated_directory),
        name="generated",
    )
    application.mount(
        "/attachments",
        StaticFiles(directory=attachments_directory),
        name="attachments",
    )

    @application.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def legacy_frontend() -> str:
        return (settings.root / "templates" / "index.html").read_text(
            encoding="utf-8"
        )

    return application
