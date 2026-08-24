from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import copilot, health
from app.core.config import get_settings
from app.core.observability import configure_observability, request_context_middleware

settings = get_settings()
configure_observability(settings)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Authenticated AI career guidance for Hirova.",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.middleware("http")(request_context_middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
app.include_router(health.router, prefix=settings.api_prefix, tags=["health"])
app.include_router(copilot.router, prefix=f"{settings.api_prefix}/copilot", tags=["copilot"])
