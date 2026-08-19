import hashlib
import math
import uuid
from dataclasses import dataclass

from qdrant_client import AsyncQdrantClient, models

from app.core.config import Settings, get_settings

VECTOR_SIZE = 256


def qdrant_point_id(collection: str, item_id: str) -> str | int:
    """1. Keep valid IDs and deterministically map domain text IDs to UUIDs."""

    if item_id.isdigit():
        return int(item_id)
    try:
        return str(uuid.UUID(item_id))
    except ValueError:
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"hirova:{collection}:{item_id}"))


def deterministic_embedding(text: str) -> list[float]:
    """2. Free local feature-hashing embedding keeps ingestion runnable without model downloads."""

    vector = [0.0] * VECTOR_SIZE
    for token in text.lower().split():
        digest = hashlib.sha256(token.encode()).digest()
        index = int.from_bytes(digest[:4], "big") % VECTOR_SIZE
        vector[index] += 1.0 if digest[4] % 2 else -1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


@dataclass
class SearchHit:
    id: str
    score: float
    payload: dict


class CareerVectorStore:
    """3. Qdrant is used when configured; an in-memory index supports tests and local demos."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = AsyncQdrantClient(url=self.settings.qdrant_url, api_key=self.settings.qdrant_api_key) if self.settings.qdrant_url else None
        self.memory: dict[str, tuple[list[float], dict]] = {}

    async def ensure_collection(self, collection: str) -> None:
        if self.client and not await self.client.collection_exists(collection):
            await self.client.create_collection(collection, vectors_config=models.VectorParams(size=VECTOR_SIZE, distance=models.Distance.COSINE))

    async def upsert(self, collection: str, item_id: str, text: str, payload: dict) -> None:
        vector = deterministic_embedding(text)
        if self.client:
            await self.ensure_collection(collection)
            point_id = qdrant_point_id(collection, item_id)
            await self.client.upsert(collection, [models.PointStruct(id=point_id, vector=vector, payload=payload)])
        else:
            self.memory[item_id] = (vector, payload)

    async def search(self, collection: str, query: str, limit: int = 5) -> list[SearchHit]:
        vector = deterministic_embedding(query)
        if self.client:
            await self.ensure_collection(collection)
            points = await self.client.query_points(collection_name=collection, query=vector, limit=limit)
            return [SearchHit(str(point.id), point.score, point.payload or {}) for point in points.points]
        ranked = sorted(((item_id, sum(a * b for a, b in zip(vector, stored, strict=True)), payload) for item_id, (stored, payload) in self.memory.items()), key=lambda item: item[1], reverse=True)
        return [SearchHit(item_id, score, payload) for item_id, score, payload in ranked[:limit]]
