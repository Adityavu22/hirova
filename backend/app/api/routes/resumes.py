from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.core.config import get_settings
from app.db.repositories import ResumeRepository, WorkspaceRepository
from app.db.session import get_session
from app.schemas import ResumeUploadResponse
from app.services.ingestion import analyze_resume, extract_text

router = APIRouter()


@router.post("/upload", response_model=ResumeUploadResponse, status_code=201)
async def upload_resume(file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    """1. Validate size/type before extraction and never log candidate document content."""

    settings = get_settings()
    content = await file.read((settings.max_upload_mb + 1) * 1024 * 1024)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB")
    safe_name = Path(file.filename or "resume.txt").name
    try:
        text = extract_text(safe_name, content)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    if len(text) < 40:
        raise HTTPException(status_code=422, detail="Document contains too little extractable text")
    analysis = analyze_resume(text)
    candidate = await WorkspaceRepository(session, user).ensure_candidate()
    await session.commit()
    resume = await ResumeRepository(session).create(candidate.id, safe_name, text, analysis)
    return ResumeUploadResponse(resume_id=resume.id, filename=safe_name, status="analyzed", analysis=analysis)
