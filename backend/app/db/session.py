from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

# 1. SQLite runs locally; swapping DATABASE_URL to asyncpg makes the same layer PostgreSQL-ready.
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """2. FastAPI dependency with automatic transaction cleanup."""

    async with SessionLocal() as session:
        yield session
