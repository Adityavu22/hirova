import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def uuid_string() -> str:
    return str(uuid.uuid4())


class Candidate(Base):
    """1. Candidate owns resumes, saved roles, and application history."""

    __tablename__ = "candidates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    headline: Mapped[str | None] = mapped_column(String(255))
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resumes: Mapped[list["Resume"]] = relationship(back_populates="candidate", cascade="all, delete-orphan")


class Resume(Base):
    """2. Raw files stay outside SQL in production; searchable metadata lives here."""

    __tablename__ = "resumes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_text: Mapped[str] = mapped_column(Text)
    structured_data: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    candidate: Mapped[Candidate] = relationship(back_populates="resumes")


class Job(Base):
    """3. Normalized job descriptions support filters plus semantic retrieval."""

    __tablename__ = "jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    external_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(180), index=True)
    company: Mapped[str] = mapped_column(String(180), index=True)
    location: Mapped[str] = mapped_column(String(180), index=True)
    work_mode: Mapped[str] = mapped_column(String(40), default="Hybrid")
    salary_min: Mapped[float | None] = mapped_column(Float)
    salary_max: Mapped[float | None] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text)
    skills: Mapped[list[str]] = mapped_column(JSON, default=list)
    seniority: Mapped[str] = mapped_column(String(80), default="Mid-Senior")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Match(Base):
    """4. Persist explainable scores so rankings are reproducible and auditable."""

    __tablename__ = "matches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    score: Mapped[float] = mapped_column(Float)
    explanation: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CandidateWorkspaceProfile(Base):
    """5. Flexible profile data supports gradual onboarding without schema churn."""

    __tablename__ = "candidate_workspace_profiles"
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SavedJob(Base):
    """6. A per-user shortlist is unique by external job ID."""

    __tablename__ = "saved_jobs"
    __table_args__ = (UniqueConstraint("candidate_id", "external_job_id", name="uq_saved_candidate_job"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    external_job_id: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Application(Base):
    """7. Candidate-owned application state powers the job-search pipeline."""

    __tablename__ = "applications"
    __table_args__ = (UniqueConstraint("candidate_id", "external_job_id", name="uq_application_candidate_job"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_string)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("candidates.id", ondelete="CASCADE"), index=True)
    external_job_id: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), default="Applied")
    note: Mapped[str] = mapped_column(Text, default="")
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
