import io
import re
from pathlib import Path

from docx import Document
from pypdf import PdfReader

ALLOWED_SUFFIXES = {".pdf", ".docx", ".txt", ".md"}
SKILL_VOCABULARY = {
    "python", "fastapi", "postgresql", "langchain", "langgraph", "rag", "figma",
    "design systems", "product strategy", "ux research", "prototyping", "analytics",
    "leadership", "mentoring", "b2b saas", "fintech", "ai product design",
}


def extract_text(filename: str, content: bytes) -> str:
    """1. Normalize supported resume/JD formats into clean searchable text."""

    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError(f"Unsupported file type: {suffix or 'unknown'}")
    if suffix == ".pdf":
        text = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages)
    elif suffix == ".docx":
        text = "\n".join(paragraph.text for paragraph in Document(io.BytesIO(content)).paragraphs)
    else:
        text = content.decode("utf-8", errors="replace")
    return re.sub(r"\s+", " ", text).strip()


def analyze_resume(text: str) -> dict:
    """2. Deterministic baseline remains available when an external LLM is unavailable."""

    lower = text.lower()
    skills = sorted(skill for skill in SKILL_VOCABULARY if skill in lower)
    metric_hits = len(re.findall(r"\b\d+(?:\.\d+)?%|₹|\$|\b\d+x\b", text, flags=re.I))
    section_hits = sum(section in lower for section in ("experience", "education", "skills", "projects"))
    score = min(95, 48 + min(len(skills), 12) * 2 + min(metric_hits, 6) * 3 + section_hits * 4)
    improvements = []
    if metric_hits < 3:
        improvements.append("Add measurable outcomes to at least three achievements.")
    if "lead" not in lower and "mentor" not in lower:
        improvements.append("Clarify leadership, mentoring, or decision ownership.")
    if len(skills) < 6:
        improvements.append("Add an evidence-backed skills section tailored to the target role.")
    return {"score": score, "skills": skills, "word_count": len(text.split()), "metric_evidence": metric_hits, "improvements": improvements}
