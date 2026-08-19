import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.graphs import build_agentic_rag_graph


async def main() -> None:
    """1. Offline regression set catches retrieval and grounding failures before deployment."""

    graph = build_agentic_rag_graph()
    cases = json.loads((Path(__file__).parent / "cases.json").read_text())
    failures = []
    for case in cases:
        result = await graph.ainvoke({"question": case["question"], "knowledge": case["knowledge"]})
        answer = result["answer"].lower()
        missing = [term for term in case.get("must_contain", []) if term.lower() not in answer]
        if missing or (case.get("must_cite") is False and result.get("sources")):
            failures.append({"case": case["name"], "missing": missing, "sources": result.get("sources")})
    print(json.dumps({"cases": len(cases), "passed": len(cases) - len(failures), "failures": failures}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
