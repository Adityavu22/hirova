from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, get_current_user
from app.db.repositories import WorkspaceRepository
from app.db.session import get_session
from app.schemas import ApplicationCreate, ApplicationRead, ApplicationUpdate, ProfilePayload, ProfileResponse

router = APIRouter()


@router.get("/me", response_model=ProfileResponse)
async def get_profile(user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    """1. Return only the authenticated candidate's profile."""

    candidate, data = await WorkspaceRepository(session, user).get_profile()
    defaults = ProfilePayload(name=candidate.name, headline=candidate.headline or "", skills=candidate.skills).model_dump()
    return ProfileResponse(candidate_id=candidate.id, email=candidate.email, **{**defaults, **data})


@router.put("/me", response_model=ProfileResponse)
async def update_profile(payload: ProfilePayload, user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    """2. Upsert a complete profile without trusting any candidate ID in the request."""

    candidate, data = await WorkspaceRepository(session, user).save_profile(payload.model_dump())
    return ProfileResponse(candidate_id=candidate.id, email=candidate.email, **data)


@router.get("/applications", response_model=list[ApplicationRead])
async def list_applications(user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await WorkspaceRepository(session, user).list_applications()


@router.post("/applications", response_model=ApplicationRead, status_code=201)
async def create_application(payload: ApplicationCreate, user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await WorkspaceRepository(session, user).create_application(payload.external_job_id, payload.status, payload.note)


@router.patch("/applications/{application_id}", response_model=ApplicationRead)
async def update_application(application_id: str, payload: ApplicationUpdate, user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    application = await WorkspaceRepository(session, user).update_application(application_id, payload.status, payload.note)
    if not application:
        raise HTTPException(status_code=404, detail="Application not found")
    return application


@router.get("/saved", response_model=list[str])
async def list_saved(user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await WorkspaceRepository(session, user).list_saved()


@router.put("/saved/{external_job_id}", response_model=list[str])
async def save_job(external_job_id: str, user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await WorkspaceRepository(session, user).save_job(external_job_id)


@router.delete("/saved/{external_job_id}", response_model=list[str])
async def unsave_job(external_job_id: str, user: CurrentUser = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    return await WorkspaceRepository(session, user).unsave_job(external_job_id)
