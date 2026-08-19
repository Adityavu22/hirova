from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.observability import configure_observability, request_context_middleware
from app.db.models import Base
from app.db.seed import seed_database
from app.db.session import SessionLocal, engine

settings = get_settings()
configure_observability(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """1. Local auto-create makes onboarding easy; production uses Alembic migrations."""

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_database(session)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AI-first job matching, resume intelligence, skill-gap analysis, interview prep, and agentic RAG.",
    lifespan=lifespan,
)
app.middleware("http")(request_context_middleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
async def root() -> dict:
    """2. Human-friendly discovery link."""

    return {"service": settings.app_name, "docs": "/docs", "health": f"{settings.api_prefix}/health"}
