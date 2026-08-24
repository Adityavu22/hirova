import uuid

from fastapi import APIRouter, Depends

from app.agents.graphs import build_agentic_rag_graph
from app.core.auth import CurrentUser, get_current_user
from app.schemas import CopilotRequest, CopilotResponse

router = APIRouter()
rag_graph = build_agentic_rag_graph()

@router.post("/ask", response_model=CopilotResponse)
async def ask_copilot(payload: CopilotRequest, user: CurrentUser = Depends(get_current_user)) -> CopilotResponse:
    """1. The agent retrieves, grades, retries if needed, then returns grounded sources."""

    knowledge = payload.knowledge or [{
        "id": "profile-status",
        "title": "Candidate profile",
        "text": "The candidate has not added enough profile or job context for a personalised recommendation.",
    }]
    result = await rag_graph.ainvoke({"question": payload.question, "candidate_id": user.id, "knowledge": knowledge})
    return CopilotResponse(answer=result["answer"], sources=result.get("sources", []), trace_id=str(uuid.uuid4()), mode=result.get("mode", "demo"))
