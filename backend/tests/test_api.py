from fastapi.testclient import TestClient

from app.core.auth import CurrentUser, get_current_user
from app.main import app


def test_health_and_copilot_routes() -> None:
    # 1. Smoke-test lifespan, database seed, and agentic RAG endpoint together.
    async def authenticated_candidate() -> CurrentUser:
        return CurrentUser(id="copilot-test", email="copilot@example.com", name="Copilot Test")

    app.dependency_overrides[get_current_user] = authenticated_candidate
    try:
        with TestClient(app) as client:
            health = client.get("/api/v1/health")
            assert health.status_code == 200
            answer = client.post("/api/v1/copilot/ask", json={"question": "Which role fits me best?"})
            assert answer.status_code == 200
            assert answer.json()["mode"] == "demo"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_authenticated_candidate_workspace_round_trip() -> None:
    # 2. Override identity at the dependency boundary so this test works with or without live Supabase configuration.
    async def authenticated_candidate() -> CurrentUser:
        return CurrentUser(id="candidate-test", email="candidate@example.com", name="Candidate One")

    app.dependency_overrides[get_current_user] = authenticated_candidate
    try:
        with TestClient(app) as client:
            initial = client.get("/api/v1/workspace/me")
            assert initial.status_code == 200
            profile = initial.json()
            profile.update({"name": "Candidate One", "headline": "Backend Engineer", "location": "Pune", "skills": ["Python", "FastAPI"], "profile_complete": True})
            profile.pop("candidate_id")
            profile.pop("email")
            updated = client.put("/api/v1/workspace/me", json=profile)
            assert updated.status_code == 200
            assert updated.json()["headline"] == "Backend Engineer"

            application = client.post("/api/v1/workspace/applications", json={"external_job_id": "seed-mercury"})
            assert application.status_code == 201
            assert client.get("/api/v1/workspace/applications").json()[0]["external_job_id"] == "seed-mercury"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
