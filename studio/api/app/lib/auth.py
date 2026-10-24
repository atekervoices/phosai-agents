"""API key authentication dependency.

Provides a simple API key check via the ``X-API-Key`` header.
Exempt paths (health check, telephony webhooks) are handled via
FastAPI dependency overrides or by mounting them without the dep.

Security note: API key comparison uses ``hmac.compare_digest`` to
prevent timing-oracle attacks. A naive ``==`` comparison short-circuits
on the first mismatched byte, allowing an attacker to statistically
infer the key one character at a time by measuring response latencies.
``compare_digest`` always takes the same time regardless of where the
strings differ, eliminating that signal.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hmac
from typing import Any

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from sqlalchemy import select

from app.lib import get_settings
from app.lib.database import async_session
from app.models.api_key import APIKey, SecureAPIKeyEngine

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_superadmin_key_header = APIKeyHeader(name="X-SuperAdmin-Key", auto_error=False)


async def require_api_key(
    request: Request,
    key: str | None = Security(_api_key_header),
) -> str:
    """Validate the API key from the request header (X-API-Key or Authorization Bearer).

    Supports:
      1. Dynamic sk-phos- customer keys verified via SHA-256 and constant-time check.
      2. Environment-configured static admin API keys.

    Raises:
        HTTPException 401 if the key is missing or invalid.
    """
    settings = get_settings()

    # Fallback to Authorization: Bearer <key> header if X-API-Key is not set
    if not key:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            key = auth_header.split(" ", 1)[1].strip()

    # Skip auth in development when no key is configured
    if settings.is_development and settings.auth.api_key == "" and not key:
        return "dev-no-key"

    if not key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Provide via 'X-API-Key' or 'Authorization: Bearer sk-phos-...'",
        )

    # Check for dynamic sk-phos- key
    if key.startswith(SecureAPIKeyEngine.PREFIX):
        parts = key.rsplit("_", 1)
        if len(parts) != 2:
            raise HTTPException(status_code=401, detail="Malformed API key")

        prefix = parts[0]  # e.g., "sk-phos-a1b2c3d4"

        async with async_session() as session:
            query = select(APIKey).where(
                APIKey.key_prefix == prefix,
                APIKey.is_active == True,
            )
            result = await session.execute(query)
            candidates = result.scalars().all()

            matching_key: APIKey | None = None
            for record in candidates:
                if SecureAPIKeyEngine.verify(key, record.hashed_key):
                    matching_key = record
                    break

            if not matching_key:
                raise HTTPException(status_code=401, detail="Invalid or revoked API key")

            # Update last_used_at timestamp
            try:
                matching_key.last_used_at = datetime.now(timezone.utc)
                await session.commit()
            except Exception:
                pass

            # Inject tenant context into request.state
            request.state.tenant = TenantContext(
                user_id=matching_key.user_id,
                organization_id=matching_key.organization_id,
                role="api_client",
            )
            request.state.api_key = matching_key

            return key

    # Constant-time comparison for static system API key
    if settings.auth.api_key and hmac.compare_digest(key, settings.auth.api_key):
        return key

    raise HTTPException(status_code=401, detail="Invalid API key")


async def require_super_admin(
    request: Request,
    api_key: str | None = Security(_api_key_header),
    superadmin_key: str | None = Security(_superadmin_key_header),
) -> str:
    """Validate Super-Admin authorization header or key.

    In development mode or when no SUPERADMIN_API_KEY is configured,
    access is granted for local development testing.
    """
    settings = get_settings()

    # In development mode, allow if no superadmin key is set
    if settings.is_development and settings.auth.superadmin_api_key == "":
        return "dev-superadmin"

    provided_key = superadmin_key or api_key
    if not provided_key:
        raise HTTPException(status_code=403, detail="Super-Admin access required")

    expected_key = settings.auth.superadmin_api_key or settings.auth.api_key
    if expected_key and not hmac.compare_digest(provided_key, expected_key):
        raise HTTPException(status_code=403, detail="Invalid Super-Admin key")

    return provided_key


@dataclass
class TenantContext:
    user_id: str | None = None
    organization_id: str | None = None
    role: str = "member"


async def require_tenant(
    request: Request,
) -> TenantContext:
    """Extract authenticated user and organization tenant context.

    Parses:
      1. X-User-Id and X-Organization-Id headers forwarded by Next.js proxy middleware.
      2. Authenticated API key tenant context on request.state (for sk-phos- callers).
    """
    user_id = request.headers.get("X-User-Id")
    org_id = request.headers.get("X-Organization-Id")
    role_header = request.headers.get("X-Role", "").strip().lower()

    if org_id or user_id:
        is_admin = role_header == "admin"
        return TenantContext(
            user_id=user_id,
            organization_id=org_id,
            role="admin" if is_admin else "member",
        )

    # If caller authenticated via an sk-phos- API key
    if hasattr(request.state, "tenant") and request.state.tenant:
        return request.state.tenant

    return TenantContext(
        user_id="default-user",
        organization_id="default",
        role="member",
    )


if "get_agent_organization_id" not in globals():
    async def get_agent_organization_id(db: Any, agent_id: Any) -> Any | None:  # type: ignore[misc, unused-ignore]
        return None


# Re-usable dependencies
RequireAuth = Depends(require_api_key)
RequireSuperAdmin = Depends(require_super_admin)
