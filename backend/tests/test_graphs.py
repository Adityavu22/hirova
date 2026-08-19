import pytest

from app.agents.graphs import build_agentic_rag_graph, build_career_workflow


@pytest.mark.asyncio
async def test_parent_workflow_runs_subgraphs() -> None:
    # 1. Parent graph must expose outputs created by both reusable subgraphs.
    graph = build_career_workflow()
    result = await graph.ainvoke({"resume_text":"Experience with Figma and design systems. Improved adoption 20%.", "job_description":"Need design systems, AI product design, leadership and Figma."})
    assert "resume_analysis" in result
    assert "ai product design" in result["skill_gap"]["missing"]
    assert result["interview_plan"]["questions"]


@pytest.mark.asyncio
async def test_agentic_rag_returns_grounded_sources_in_demo_mode() -> None:
    # 2. Retrieval and grading should work without external model or vector services.
    graph = build_agentic_rag_graph()
    result = await graph.ainvoke({"question":"What should I improve in my resume?", "knowledge":[{"id":"resume","title":"Resume review","text":"The resume needs quantified outcomes and leadership evidence."}]})
    assert result["answer"]
    assert result["mode"] == "demo"
    assert result["sources"][0]["id"] == "resume"
