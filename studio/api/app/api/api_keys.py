"""API Key management routes for PhosAI & Ateker Voices."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.auth import TenantContext, require_tenant
from app.lib.database import get_db
from app.models.api_key import APIKey, SecureAPIKeyEngine

router = APIRouter(prefix="/api-keys", tags=["API Keys"])


class CreateAPIKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Friendly label for the API key")
    scopes: list[str] = Field(
        default=["stt", "tts", "translate", "agents"],
        description="Allowed permission scopes for this key",
    )


class APIKeyItem(BaseModel):
    id: uuid.UUID
    name: str
    masked_key: str
    scopes: list[str]
    is_active: bool
    created_at: datetime
    last_used_at: datetime | None = None

    class Config:
        from_attributes = True


class CreateAPIKeyResponse(APIKeyItem):
    raw_key: str
    warning: str = (
        "Please save this secret API key in a secure password manager. "
        "For security reasons, you will not be able to view it again."
    )


@router.post("", response_model=CreateAPIKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    req: CreateAPIKeyRequest,
    tenant: TenantContext = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
) -> CreateAPIKeyResponse:
    """Generate a new sk-phos- API key for the current workspace/tenant.
    
    The raw key is returned exactly once in the response.
    """
    org_id = tenant.organization_id or "default"
    generated = SecureAPIKeyEngine.generate_key(name=req.name)

    api_key_record = APIKey(
        organization_id=org_id,
        user_id=tenant.user_id,
        name=req.name,
        key_prefix=generated["key_prefix"],
        hashed_key=generated["hashed_key"],
        masked_key=generated["masked_key"],
        scopes=req.scopes,
        is_active=True,
    )
    db.add(api_key_record)
    await db.commit()
    await db.refresh(api_key_record)

    return CreateAPIKeyResponse(
        id=api_key_record.id,
        name=api_key_record.name,
        masked_key=api_key_record.masked_key,
        scopes=api_key_record.scopes,
        is_active=api_key_record.is_active,
        created_at=api_key_record.created_at,
        last_used_at=api_key_record.last_used_at,
        raw_key=generated["raw_key"],
    )


@router.get("", response_model=list[APIKeyItem])
async def list_api_keys(
    tenant: TenantContext = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
) -> list[APIKeyItem]:
    """List all active API keys for the current workspace.
    
    Note: Raw keys are never stored and cannot be returned. Only masked keys are listed.
    """
    org_id = tenant.organization_id or "default"
    query = (
        select(APIKey)
        .where(
            APIKey.organization_id == org_id,
            APIKey.is_active == True,
        )
        .order_by(APIKey.created_at.desc())
    )
    result = await db.execute(query)
    keys = result.scalars().all()

    return [
        APIKeyItem(
            id=k.id,
            name=k.name,
            masked_key=k.masked_key,
            scopes=k.scopes,
            is_active=k.is_active,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
        )
        for k in keys
    ]


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: uuid.UUID,
    tenant: TenantContext = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Revoke an API key immediately. Revoked keys cannot be restored."""
    org_id = tenant.organization_id or "default"
    query = select(APIKey).where(
        APIKey.id == key_id,
        APIKey.organization_id == org_id,
    )
    result = await db.execute(query)
    api_key_record = result.scalar_one_or_none()

    if not api_key_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found or does not belong to this workspace",
        )

    api_key_record.is_active = False
    await db.commit()

    return {
        "status": "revoked",
        "id": str(key_id),
        "masked_key": api_key_record.masked_key,
    }
