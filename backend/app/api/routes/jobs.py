from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import JobRepository, ResumeRepository
from app.db.session import get_session
from app.schemas import JobCreate, JobRead, MatchRequest, MatchResult
from app.services.matching import rank_jobs

router = APIRouter()


@router.get("", response_model=list[JobRead])
async def list_jobs(q: str | None = Query(default=None, max_length=120), limit: int = Query(default=50, ge=1, le=100), session: AsyncSession = Depends(get_session)):
    """1. Structured filters are kept separate from semantic ranking."""

    return await JobRepository(session).list(q, limit)


@router.post("", response_model=JobRead, status_code=201)
async def ingest_job(payload: JobCreate, session: AsyncSession = Depends(get_session)):
    """2. Idempotent external IDs make JD ingestion safe to retry."""

    return await JobRepository(session).upsert(payload)


@router.post("/match", response_model=list[MatchResult])
async def match_jobs(payload: MatchRequest, session: AsyncSession = Depends(get_session)):
    """3. Return explainable hybrid rankings instead of an opaque relevance number."""

    text = payload.resume_text
    if payload.resume_id:
        resume = await ResumeRepository(session).get(payload.resume_id)
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        text = resume.content_text
    if not text:
        raise HTTPException(status_code=422, detail="Provide resume_id or resume_text")
    jobs = await JobRepository(session).list(limit=200)
    ranked = rank_jobs(text, jobs, payload.limit)
    return [MatchResult(job=JobRead.model_validate(job), **details) for job, details in ranked]
