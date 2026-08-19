import logging
import os
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

from app.core.config import Settings


def configure_observability(settings: Settings) -> None:
    """1. Configure safe structured logs and optional LangSmith tracing."""

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    if settings.langsmith_tracing and settings.langsmith_api_key:
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
        os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key


async def request_context_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """2. Attach correlation IDs and latency without logging resume content."""

    request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    response.headers["x-process-time-ms"] = f"{(time.perf_counter() - started) * 1000:.2f}"
    return response
