from fastapi.testclient import TestClient

from app.serverless import app


def test_serverless_surface_exposes_health_and_protects_copilot() -> None:
    """1. Lambda surface stays minimal and rejects anonymous AI requests."""

    with TestClient(app) as client:
        health = client.get("/api/v1/health")
        unauthenticated = client.post("/api/v1/copilot/ask", json={"question": "Help me"})

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert unauthenticated.status_code == 401
