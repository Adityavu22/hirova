from app.db.models import Job
from app.services.matching import rank_jobs, score_job


def make_job(title: str, skills: list[str]) -> Job:
    return Job(id=title.lower().replace(" ", "-"), external_id=title, title=title, company="Test", location="Remote", work_mode="Remote", description=f"Need {' '.join(skills)}", skills=skills, seniority="Senior")


def test_hybrid_match_is_explainable_and_ranked() -> None:
    # 1. More evidence overlap must rank above a weak keyword-only match.
    resume = "Senior product designer using Figma, design systems, product strategy and fintech research."
    strong = make_job("Strong role", ["figma", "design systems", "product strategy"])
    weak = make_job("Weak role", ["python", "fastapi", "postgresql"])
    details = score_job(resume, strong)
    assert details["score"] > score_job(resume, weak)["score"]
    assert "figma" in details["matched_skills"]
    assert rank_jobs(resume, [weak, strong])[0][0].title == "Strong role"
