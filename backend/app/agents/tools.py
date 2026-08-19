import re

from langchain_core.tools import tool


@tool
def extract_required_skills(job_description: str) -> list[str]:
    """Extract known career skills from a job description."""

    vocabulary = ["python", "fastapi", "postgresql", "langchain", "langgraph", "rag", "figma", "design systems", "product strategy", "ux research", "prototyping", "analytics", "leadership", "mentoring", "ai product design"]
    lower = job_description.lower()
    return [skill for skill in vocabulary if skill in lower]


@tool
def evidence_overlap(resume_text: str, job_description: str) -> dict:
    """Compare normalized resume and job-description terms."""

    resume = set(re.findall(r"[a-z0-9+#.]{2,}", resume_text.lower()))
    job = set(re.findall(r"[a-z0-9+#.]{2,}", job_description.lower()))
    overlap = sorted(resume & job)
    return {"overlap": overlap[:30], "coverage": round(len(overlap) / max(len(job), 1), 3)}


@tool
def build_star_rubric(question: str) -> dict:
    """Create a concise STAR answer rubric for an interview question."""

    return {"question": question, "rubric": ["Situation is specific", "Task and ownership are clear", "Actions show judgment", "Result is quantified", "Reflection shows learning"]}
