import uuid

from fastapi import APIRouter

from app.agents.graphs import build_agentic_rag_graph
from app.schemas import CopilotRequest, CopilotResponse

router = APIRouter()
rag_graph = build_agentic_rag_graph()

DEMO_KNOWLEDGE = [
    {"id":"profile","title":"Candidate profile","text":"The candidate is a senior product designer with design systems, fintech, Figma, product strategy, and UX research experience."},
    {"id":"mercury","title":"Mercury Labs role","text":"Mercury Labs has a 94 percent match. The role needs design systems, fintech workflows, product strategy, and quantified outcomes."},
    {"id":"skill-gap","title":"Skill-gap analysis","text":"The candidate's largest current gaps are AI product design evidence and explicit people leadership examples."},
    {"id":"resume","title":"Resume analysis","text":"Resume score is 82. Add measurable outcomes to two case studies and clarify mentoring scope."},
]


@router.post("/ask", response_model=CopilotResponse)
async def ask_copilot(payload: CopilotRequest) -> CopilotResponse:
    """1. The agent retrieves, grades, retries if needed, then returns grounded sources."""

    result = await rag_graph.ainvoke({"question": payload.question, "candidate_id": payload.candidate_id, "knowledge": DEMO_KNOWLEDGE})
    return CopilotResponse(answer=result["answer"], sources=result.get("sources", []), trace_id=str(uuid.uuid4()), mode=result.get("mode", "demo"))
