from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class JobRead(BaseModel):
    id: str
    title: str
    company: str
    location: str
    work_mode: str
    salary_min: float | None = None
    salary_max: float | None = None
    description: str
    skills: list[str]
    seniority: str

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    external_id: str
    title: str
    company: str
    location: str
    work_mode: str = "Hybrid"
    salary_min: float | None = None
    salary_max: float | None = None
    description: str
    skills: list[str] = Field(default_factory=list)
    seniority: str = "Mid-Senior"


class MatchRequest(BaseModel):
    resume_id: str | None = None
    resume_text: str | None = None
    limit: int = Field(default=10, ge=1, le=50)


class MatchResult(BaseModel):
    job: JobRead
    score: float
    matched_skills: list[str]
    missing_skills: list[str]
    explanation: str


class ResumeUploadResponse(BaseModel):
    resume_id: str
    filename: str
    status: str
    analysis: dict


class SkillGapRequest(BaseModel):
    resume_text: str
    job_description: str


class InterviewRequest(BaseModel):
    resume_text: str
    job_description: str
    question_count: int = Field(default=6, ge=3, le=12)


class CopilotRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2_000)
    candidate_id: str = "demo-user"


class CopilotResponse(BaseModel):
    answer: str
    sources: list[dict] = Field(default_factory=list)
    trace_id: str | None = None
    mode: str


class ProfilePayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str = Field(default="", max_length=30)
    headline: str = Field(default="", max_length=255)
    location: str = Field(default="", max_length=180)
    experience_years: str = Field(default="", max_length=40)
    bio: str = Field(default="", max_length=2_000)
    skills: list[str] = Field(default_factory=list, max_length=80)
    preferred_roles: list[str] = Field(default_factory=list, max_length=20)
    preferred_locations: list[str] = Field(default_factory=list, max_length=20)
    expected_salary: str = Field(default="", max_length=80)
    notice_period: str = Field(default="", max_length=80)
    open_to_work: bool = True
    profile_complete: bool = False


class ProfileResponse(ProfilePayload):
    candidate_id: str
    email: str


ApplicationStatus = Literal["Applied", "Screening", "Interview", "Offer", "Rejected"]


class ApplicationCreate(BaseModel):
    external_job_id: str = Field(min_length=1, max_length=100)
    status: ApplicationStatus = "Applied"
    note: str = Field(default="", max_length=2_000)


class ApplicationUpdate(BaseModel):
    status: ApplicationStatus
    note: str = Field(default="", max_length=2_000)


class ApplicationRead(ApplicationCreate):
    id: str
    applied_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
