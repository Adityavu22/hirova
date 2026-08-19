from typing import Any, TypedDict


class CareerState(TypedDict, total=False):
    """1. Shared typed state is the contract between deterministic and AI nodes."""

    candidate_id: str
    resume_text: str
    job_description: str
    question: str
    rewritten_question: str
    knowledge: list[dict[str, Any]]
    retrieved_context: list[dict[str, Any]]
    retrieval_attempts: int
    resume_analysis: dict[str, Any]
    recommendations: list[dict[str, Any]]
    skill_gap: dict[str, Any]
    interview_plan: dict[str, Any]
    answer: str
    sources: list[dict[str, Any]]
    mode: str
