import hashlib
import json
import re
from typing import Literal

from langgraph.graph import END, START, StateGraph

from app.agents.state import CareerState
from app.agents.tools import build_star_rubric, evidence_overlap, extract_required_skills
from app.services.llm import LLMGateway
from app.services.vector_store import CareerVectorStore


def build_resume_subgraph() -> StateGraph:
    """1. Resume subgraph converts unstructured text into scored evidence."""

    graph = StateGraph(CareerState)

    async def analyze(state: CareerState) -> dict:
        # Resume parsers are loaded only by the full backend, not the minimal Lambda copilot.
        from app.services.ingestion import analyze_resume

        return {"resume_analysis": analyze_resume(state.get("resume_text", ""))}

    graph.add_node("analyze_resume", analyze)
    graph.add_edge(START, "analyze_resume")
    graph.add_edge("analyze_resume", END)
    return graph.compile()


def build_interview_subgraph() -> StateGraph:
    """2. Interview subgraph grounds questions and evaluation rubrics in the target JD."""

    graph = StateGraph(CareerState)

    async def questions(state: CareerState) -> dict:
        skills = extract_required_skills.invoke({"job_description": state.get("job_description", "")})
        focus = skills[:3] or ["product judgment", "collaboration", "measurable impact"]
        generated = [f"Tell me about a time you demonstrated {skill}. What changed because of your work?" for skill in focus]
        return {"interview_plan": {"questions": generated, "focus_skills": focus}}

    async def rubrics(state: CareerState) -> dict:
        plan = state.get("interview_plan", {})
        plan["rubrics"] = [build_star_rubric.invoke({"question": question}) for question in plan.get("questions", [])]
        return {"interview_plan": plan}

    graph.add_node("generate_grounded_questions", questions)
    graph.add_node("attach_answer_rubrics", rubrics)
    graph.add_edge(START, "generate_grounded_questions")
    graph.add_edge("generate_grounded_questions", "attach_answer_rubrics")
    graph.add_edge("attach_answer_rubrics", END)
    return graph.compile()


def build_agentic_rag_graph(llm: LLMGateway | None = None, vector_store: CareerVectorStore | None = None):
    """3. Agentic RAG rewrites, retrieves, grades, retries once, then answers with citations."""

    llm = llm or LLMGateway()
    store = vector_store or CareerVectorStore()
    graph = StateGraph(CareerState)

    async def rewrite(state: CareerState) -> dict:
        question = state.get("question", "").strip()
        rewritten = re.sub(r"\b(my|me|I)\b", "the candidate", question, flags=re.I)
        return {"rewritten_question": rewritten, "retrieval_attempts": state.get("retrieval_attempts", 0) + 1}

    async def retrieve(state: CareerState) -> dict:
        owner_hash = hashlib.sha256(state.get("candidate_id", "anonymous").encode()).hexdigest()[:24]
        collection = f"career_knowledge_{owner_hash}"
        for index, item in enumerate(state.get("knowledge", [])):
            await store.upsert(collection, str(item.get("id", index)), str(item.get("text", "")), item)
        hits = await store.search(collection, state.get("rewritten_question") or state.get("question", ""), limit=4)
        context = [{**hit.payload, "score": round(hit.score, 3)} for hit in hits if hit.score > 0]
        return {"retrieved_context": context}

    async def grade(state: CareerState) -> dict:
        stop_words = {"the", "a", "an", "is", "are", "my", "me", "i", "candidate", "what", "which", "should", "do", "to", "in"}
        query_terms = set(re.findall(r"\w+", (state.get("rewritten_question") or "").lower())) - stop_words
        graded = [item for item in state.get("retrieved_context", []) if query_terms & set(re.findall(r"\w+", str(item.get("text", "")).lower()))]
        return {"retrieved_context": graded}

    def route_after_grade(state: CareerState) -> Literal["answer", "rewrite"]:
        return "answer" if state.get("retrieved_context") or state.get("retrieval_attempts", 0) >= 2 else "rewrite"

    async def answer(state: CareerState) -> dict:
        context = state.get("retrieved_context", [])
        if context:
            evidence = str(context[0].get("text", "")).strip()
            fallback = f"Based on your supplied career evidence: {evidence} Next action: verify this evidence against the target role and update your application materials."
        else:
            fallback = "I do not have enough relevant evidence to answer confidently. Add your target role, skills, or a matching job, then ask again."
        prompt = f"Question: {state.get('question')}\nCareer context: {json.dumps(context, default=str)}"
        response = await llm.generate("You are a concise career copilot. Use only supplied context, state uncertainty, and give one concrete next action.", prompt, fallback)
        sources = [{"id": item.get("id"), "title": item.get("title", "Career context"), "score": item.get("score")} for item in context]
        return {"answer": response, "sources": sources, "mode": llm.mode}

    graph.add_node("rewrite_query", rewrite)
    graph.add_node("retrieve", retrieve)
    graph.add_node("grade_documents", grade)
    graph.add_node("generate_answer", answer)
    graph.add_edge(START, "rewrite_query")
    graph.add_edge("rewrite_query", "retrieve")
    graph.add_edge("retrieve", "grade_documents")
    graph.add_conditional_edges("grade_documents", route_after_grade, {"answer": "generate_answer", "rewrite": "rewrite_query"})
    graph.add_edge("generate_answer", END)
    return graph.compile()


def build_career_workflow():
    """4. Parent workflow composes reusable subgraphs into one end-to-end career analysis."""

    graph = StateGraph(CareerState)
    resume_graph = build_resume_subgraph()
    interview_graph = build_interview_subgraph()

    async def skill_gap(state: CareerState) -> dict:
        required = extract_required_skills.invoke({"job_description": state.get("job_description", "")})
        current = set(state.get("resume_analysis", {}).get("skills", []))
        overlap = evidence_overlap.invoke({"resume_text": state.get("resume_text", ""), "job_description": state.get("job_description", "")})
        return {"skill_gap": {"matched": sorted(current & set(required)), "missing": sorted(set(required) - current), "evidence_coverage": overlap["coverage"]}}

    graph.add_node("resume_subgraph", resume_graph)
    graph.add_node("skill_gap_analysis", skill_gap)
    graph.add_node("interview_subgraph", interview_graph)
    graph.add_edge(START, "resume_subgraph")
    graph.add_edge("resume_subgraph", "skill_gap_analysis")
    graph.add_edge("skill_gap_analysis", "interview_subgraph")
    graph.add_edge("interview_subgraph", END)
    return graph.compile()
