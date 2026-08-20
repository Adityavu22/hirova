from dataclasses import dataclass

import httpx
from fastapi import Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    """1. Trusted identity passed to repositories instead of client-supplied candidate IDs."""

    id: str
    email: str
    name: str


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer),
    x_hirova_user_id: str | None = Header(default=None),
    x_hirova_user_email: str | None = Header(default=None),
) -> CurrentUser:
    """2. Verify Supabase access tokens; only non-production environments allow a local identity."""

    settings = get_settings()
    if settings.supabase_url and settings.supabase_publishable_key:
        if not credentials:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                response = await client.get(
                    f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
                    headers={
                        "apikey": settings.supabase_publishable_key,
                        "Authorization": f"Bearer {credentials.credentials}",
                    },
                )
            response.raise_for_status()
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session") from exc
        payload = response.json()
        metadata = payload.get("user_metadata") or {}
        return CurrentUser(
            id=str(payload["id"]),
            email=str(payload.get("email") or f"{payload['id']}@account.hirova.local"),
            name=str(metadata.get("full_name") or metadata.get("name") or "Hirova member"),
        )

    if settings.environment == "production":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Production authentication is not configured")
    return CurrentUser(
        id=(x_hirova_user_id or "local-user")[:120],
        email=(x_hirova_user_email or "local@hirova.test")[:255],
        name="Local member",
    )
