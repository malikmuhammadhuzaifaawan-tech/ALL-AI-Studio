"""ASGI entry point for AI Studio's FastAPI backend."""

from backend.application import create_application

app = create_application()
