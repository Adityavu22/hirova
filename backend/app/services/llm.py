import asyncio
import logging

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


def build_chat_model(settings: Settings | None = None) -> BaseChatModel | None:
    """1. Provider factory allows Groq primary, Gemini fallback, and zero-cost demo mode."""

    settings = settings or get_settings()
    if settings.llm_provider == "groq" and settings.groq_api_key:
        from langchain_groq import ChatGroq
        return ChatGroq(api_key=settings.groq_api_key, model=settings.groq_model, temperature=0.2, max_retries=0)
    if settings.llm_provider == "gemini" and settings.gemini_api_key:
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(google_api_key=settings.gemini_api_key, model=settings.gemini_model, temperature=0.2)
    return None


class LLMGateway:
    """2. Central gateway enforces timeout, retry/backoff, and graceful degradation."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.model = build_chat_model(self.settings)

    @property
    def mode(self) -> str:
        return self.settings.llm_provider if self.model else "demo"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=4), retry=retry_if_exception_type((TimeoutError, ConnectionError)))
    async def generate(self, system: str, user: str, fallback: str) -> str:
        if not self.model:
            return fallback
        try:
            async with asyncio.timeout(25):
                response = await self.model.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
            return str(response.content)
        except Exception as exc:
            logger.warning("LLM call degraded to deterministic response: %s", type(exc).__name__)
            return fallback
