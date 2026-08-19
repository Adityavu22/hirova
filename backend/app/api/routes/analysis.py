from fastapi import APIRouter

from app.agents.graphs import build_career_workflow
from app.schemas import InterviewRequest, SkillGapRequest

router = APIRouter()
career_workflow = build_career_workflow()


@router.post("/skill-gap")
async def skill_gap(payload: SkillGapRequest) -> dict:
    """1. Run the parent graph and return the reusable skill-gap sub-result."""

    result = await career_workflow.ainvoke({"resume_text": payload.resume_text, "job_description": payload.job_description})
    return {"resume_analysis": result["resume_analysis"], "skill_gap": result["skill_gap"]}


@router.post("/interview-prep")
async def interview_prep(payload: InterviewRequest) -> dict:
    """2. JD-grounded questions and STAR rubrics are produced by a dedicated subgraph."""

    result = await career_workflow.ainvoke({"resume_text": payload.resume_text, "job_description": payload.job_description})
    plan = result["interview_plan"]
    plan["questions"] = plan["questions"][: payload.question_count]
    plan["rubrics"] = plan["rubrics"][: payload.question_count]
    return plan
