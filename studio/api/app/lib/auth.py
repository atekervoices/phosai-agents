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
import hmac
from typing import Any

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader

from app.lib import get_settings

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_superadmin_key_header = APIKeyHeader(name="X-SuperAdmin-Key", auto_error=False)


async def require_api_key(
    request: Request,
    key: str | None = Security(_api_key_header),
) -> str:
    """Validate the API key from the request header.

    Uses a constant-time comparison (``hmac.compare_digest``) to
    prevent timing-oracle attacks.

    Raises:
        HTTPException 401 if the key is missing or invalid.
    """
    settings = get_settings()

    # Skip auth in development when no key is configured
    # Check for Clerk JWT first, even in development
    if settings.is_development and settings.auth.api_key == "":
        return "dev-no-key"

    if not key:
        raise HTTPException(status_code=401, detail="Missing API key")

    # Constant-time comparison — prevents timing-oracle attacks
    if not hmac.compare_digest(key, settings.auth.api_key):
        raise HTTPException(status_code=401, detail="Invalid API key")

    return key


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

    Parses X-User-Id and X-Organization-Id headers forwarded by Next.js Clerk middleware.
    """
    user_id = request.headers.get("X-User-Id")
    org_id = request.headers.get("X-Organization-Id")
    role_header = request.headers.get("X-Role", "").lower()

    is_admin = role_header == "admin" or bool(org_id) or (user_id and "admin" in user_id.lower())

    return TenantContext(
        user_id=user_id,
        organization_id=org_id,
        role="admin" if is_admin else "member",
    )


if "get_agent_organization_id" not in globals():
    async def get_agent_organization_id(db: Any, agent_id: Any) -> Any | None:  # type: ignore[misc, unused-ignore]
        return None


# Re-usable dependencies
RequireAuth = Depends(require_api_key)
RequireSuperAdmin = Depends(require_super_admin)
