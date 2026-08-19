from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    """1. Lightweight liveness endpoint for Docker and deployment probes."""

    settings = get_settings()
    return {"status": "ok", "service": settings.app_name, "environment": settings.environment}
