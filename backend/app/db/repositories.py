from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.db.models import Application, Candidate, CandidateWorkspaceProfile, Job, Resume, SavedJob
from app.schemas import JobCreate


class JobRepository:
    """1. Repository isolates SQL from API and agent layers."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, query: str | None = None, limit: int = 50) -> list[Job]:
        statement = select(Job).limit(limit)
        if query:
            pattern = f"%{query}%"
            statement = statement.where(or_(Job.title.ilike(pattern), Job.company.ilike(pattern), Job.description.ilike(pattern)))
        return list((await self.session.scalars(statement)).all())

    async def get(self, job_id: str) -> Job | None:
        return await self.session.get(Job, job_id)

    async def upsert(self, payload: JobCreate) -> Job:
        existing = await self.session.scalar(select(Job).where(Job.external_id == payload.external_id))
        if existing:
            for field, value in payload.model_dump().items():
                setattr(existing, field, value)
            job = existing
        else:
            job = Job(**payload.model_dump())
            self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job


class ResumeRepository:
    """2. Resume writes remain transactional even when later AI steps fail."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, candidate_id: str, filename: str, text: str, analysis: dict) -> Resume:
        resume = Resume(candidate_id=candidate_id, filename=filename, content_text=text, structured_data=analysis, score=analysis.get("score"))
        self.session.add(resume)
        await self.session.commit()
        await self.session.refresh(resume)
        return resume

    async def get(self, resume_id: str) -> Resume | None:
        return await self.session.get(Resume, resume_id)


class WorkspaceRepository:
    """3. Candidate-owned profile, shortlist, and pipeline writes stay in one transactional boundary."""

    def __init__(self, session: AsyncSession, user: CurrentUser) -> None:
        self.session = session
        self.user = user

    async def ensure_candidate(self) -> Candidate:
        candidate = await self.session.get(Candidate, self.user.id)
        if candidate:
            return candidate
        candidate = await self.session.scalar(select(Candidate).where(Candidate.email == self.user.email))
        if candidate:
            return candidate
        candidate = Candidate(id=self.user.id, name=self.user.name, email=self.user.email, skills=[])
        self.session.add(candidate)
        await self.session.flush()
        return candidate

    async def get_profile(self) -> tuple[Candidate, dict]:
        candidate = await self.ensure_candidate()
        profile = await self.session.get(CandidateWorkspaceProfile, candidate.id)
        return candidate, profile.data if profile else {}

    async def save_profile(self, data: dict) -> tuple[Candidate, dict]:
        candidate = await self.ensure_candidate()
        candidate.name = data["name"]
        candidate.headline = data.get("headline")
        candidate.skills = data.get("skills", [])
        profile = await self.session.get(CandidateWorkspaceProfile, candidate.id)
        if profile:
            profile.data = data
        else:
            self.session.add(CandidateWorkspaceProfile(candidate_id=candidate.id, data=data))
        await self.session.commit()
        return candidate, data

    async def list_applications(self) -> list[Application]:
        candidate = await self.ensure_candidate()
        statement = select(Application).where(Application.candidate_id == candidate.id).order_by(Application.updated_at.desc())
        return list((await self.session.scalars(statement)).all())

    async def create_application(self, external_job_id: str, status: str, note: str) -> Application:
        candidate = await self.ensure_candidate()
        existing = await self.session.scalar(select(Application).where(Application.candidate_id == candidate.id, Application.external_job_id == external_job_id))
        if existing:
            return existing
        application = Application(candidate_id=candidate.id, external_job_id=external_job_id, status=status, note=note)
        self.session.add(application)
        await self.session.commit()
        await self.session.refresh(application)
        return application

    async def update_application(self, application_id: str, status: str, note: str) -> Application | None:
        candidate = await self.ensure_candidate()
        application = await self.session.scalar(select(Application).where(Application.id == application_id, Application.candidate_id == candidate.id))
        if not application:
            return None
        application.status = status
        application.note = note
        await self.session.commit()
        await self.session.refresh(application)
        return application

    async def list_saved(self) -> list[str]:
        candidate = await self.ensure_candidate()
        statement = select(SavedJob.external_job_id).where(SavedJob.candidate_id == candidate.id).order_by(SavedJob.created_at.desc())
        return list((await self.session.scalars(statement)).all())

    async def save_job(self, external_job_id: str) -> list[str]:
        candidate = await self.ensure_candidate()
        existing = await self.session.scalar(select(SavedJob).where(SavedJob.candidate_id == candidate.id, SavedJob.external_job_id == external_job_id))
        if not existing:
            self.session.add(SavedJob(candidate_id=candidate.id, external_job_id=external_job_id))
            await self.session.commit()
        return await self.list_saved()

    async def unsave_job(self, external_job_id: str) -> list[str]:
        candidate = await self.ensure_candidate()
        saved = await self.session.scalar(select(SavedJob).where(SavedJob.candidate_id == candidate.id, SavedJob.external_job_id == external_job_id))
        if saved:
            await self.session.delete(saved)
            await self.session.commit()
        return await self.list_saved()
