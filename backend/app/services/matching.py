import re

from app.db.models import Job
from app.services.vector_store import deterministic_embedding


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]{2,}", text.lower()))


def _cosine(left: list[float], right: list[float]) -> float:
    return sum(a * b for a, b in zip(left, right, strict=True))


def score_job(resume_text: str, job: Job) -> dict:
    """1. Hybrid score blends semantic similarity with explicit skill evidence."""

    resume_tokens = _tokens(resume_text)
    job_skills = {skill.lower() for skill in (job.skills or [])}
    matched = sorted(skill for skill in job_skills if all(part in resume_tokens for part in skill.split()))
    missing = sorted(job_skills - set(matched))
    skill_score = len(matched) / max(len(job_skills), 1)
    semantic = max(0.0, _cosine(deterministic_embedding(resume_text), deterministic_embedding(f"{job.title} {job.description} {' '.join(job.skills or [])}")))
    score = round((0.65 * skill_score + 0.35 * semantic) * 100, 1)
    explanation = f"Matched {len(matched)} of {len(job_skills)} core skills. Strongest evidence: {', '.join(matched[:3]) or 'transferable experience'}."
    return {"score": score, "matched_skills": matched, "missing_skills": missing, "explanation": explanation}


def rank_jobs(resume_text: str, jobs: list[Job], limit: int = 10) -> list[tuple[Job, dict]]:
    """2. Stable sorting makes recommendations deterministic and testable."""

    scored = [(job, score_job(resume_text, job)) for job in jobs]
    return sorted(scored, key=lambda item: (-item[1]["score"], item[0].title))[:limit]
