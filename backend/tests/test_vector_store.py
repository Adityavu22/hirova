from app.services.vector_store import qdrant_point_id


def test_qdrant_point_id_is_valid_and_stable() -> None:
    # 1. Human-readable domain IDs become stable UUIDs accepted by Qdrant.
    first = qdrant_point_id("career_knowledge", "resume")
    second = qdrant_point_id("career_knowledge", "resume")
    assert first == second
    assert first != "resume"

    # 2. Existing numeric and UUID identifiers preserve their Qdrant-safe form.
    assert qdrant_point_id("jobs", "42") == 42
    assert qdrant_point_id("jobs", "123e4567-e89b-12d3-a456-426614174000") == "123e4567-e89b-12d3-a456-426614174000"
