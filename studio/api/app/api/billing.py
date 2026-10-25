"""Billing and Credits API — organization wallet, metered usage analytics, and ledger."""

from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.auth import require_api_key, require_super_admin
from app.lib.database import get_db
from app.models.billing import (
    BillingEngine,
    CreditTransaction,
    UsageEvent,
    Wallet,
    RATE_CARD,
)

router = APIRouter(prefix="/billing", tags=["billing"])


# --- Schemas ---

class WalletResponse(BaseModel):
    id: uuid.UUID
    organization_id: str
    balance_credits: float
    balance_usd: float
    lifetime_granted: float
    lifetime_consumed: float
    low_balance_threshold: float
    is_low_balance: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TransactionItem(BaseModel):
    id: uuid.UUID
    amount: float
    amount_usd: float
    balance_after: float
    balance_after_usd: float
    transaction_type: str
    description: str | None
    granted_by_user_id: str | None
    created_at: datetime


class ServiceUsageStats(BaseModel):
    service_type: str
    total_units: float
    unit_type: str
    total_cost_credits: float
    total_cost_usd: float
    event_count: int


class UsageSummaryResponse(BaseModel):
    organization_id: str
    total_cost_credits: float
    total_cost_usd: float
    services: list[ServiceUsageStats]
    rate_card: dict[str, Any]


class AdjustCreditsRequest(BaseModel):
    organization_id: str = Field(..., description="Organization identifier to adjust")
    amount: float = Field(..., description="Credit amount to add (positive) or deduct (negative)")
    description: str = Field(..., description="Reason or reference for adjustment")


def _get_org_id(request: Request) -> str:
    """Helper to extract organization_id from tenant context or fallback to default."""
    tenant = getattr(request.state, "tenant", None)
    if tenant and getattr(tenant, "organization_id", None):
        return tenant.organization_id
    return "default"


# --- Endpoints ---

@router.get("/wallet", response_model=WalletResponse)
async def get_wallet(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> WalletResponse:
    """Get the credit wallet balance and status for the current workspace/organization."""
    org_id = _get_org_id(request)
    wallet = await BillingEngine.get_or_create_wallet(db, org_id)

    return WalletResponse(
        id=wallet.id,
        organization_id=wallet.organization_id,
        balance_credits=float(wallet.balance_credits),
        balance_usd=wallet.balance_usd,
        lifetime_granted=float(wallet.lifetime_granted),
        lifetime_consumed=float(wallet.lifetime_consumed),
        low_balance_threshold=float(wallet.low_balance_threshold),
        is_low_balance=wallet.is_low_balance,
        is_active=wallet.is_active,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )


@router.get("/usage", response_model=UsageSummaryResponse)
async def get_usage_summary(
    request: Request,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> UsageSummaryResponse:
    """Get aggregate consumption and breakdown across Speech-to-Text, Text-to-Speech, and Translation."""
    org_id = _get_org_id(request)
    wallet = await BillingEngine.get_or_create_wallet(db, org_id)

    # Query usage aggregated by service_type
    query = (
        select(
            UsageEvent.service_type,
            UsageEvent.unit_type,
            func.sum(UsageEvent.units_metered).label("total_units"),
            func.sum(UsageEvent.cost_credits).label("total_cost"),
            func.count(UsageEvent.id).label("event_count"),
        )
        .where(UsageEvent.wallet_id == wallet.id)
        .group_by(UsageEvent.service_type, UsageEvent.unit_type)
    )
    result = await db.execute(query)
    rows = result.all()

    services: list[ServiceUsageStats] = []
    total_cost_credits = 0.0

    for row in rows:
        service_type, unit_type, total_units, total_cost, event_count = row
        cost_val = round(float(total_cost or 0.0), 4)
        total_cost_credits += cost_val

        services.append(
            ServiceUsageStats(
                service_type=service_type,
                total_units=round(float(total_units or 0.0), 2),
                unit_type=unit_type,
                total_cost_credits=cost_val,
                total_cost_usd=round(cost_val / 1000.0, 4),
                event_count=int(event_count or 0),
            )
        )

    return UsageSummaryResponse(
        organization_id=org_id,
        total_cost_credits=round(total_cost_credits, 4),
        total_cost_usd=round(total_cost_credits / 1000.0, 4),
        services=services,
        rate_card=RATE_CARD,
    )


@router.get("/transactions", response_model=list[TransactionItem])
async def list_transactions(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> list[TransactionItem]:
    """Get the immutable audit history of credit grants and usage debits for the workspace."""
    org_id = _get_org_id(request)
    wallet = await BillingEngine.get_or_create_wallet(db, org_id)

    query = (
        select(CreditTransaction)
        .where(CreditTransaction.wallet_id == wallet.id)
        .order_by(desc(CreditTransaction.created_at))
        .limit(limit)
    )
    result = await db.execute(query)
    txs = result.scalars().all()

    return [
        TransactionItem(
            id=tx.id,
            amount=float(tx.amount),
            amount_usd=round(float(tx.amount) / 1000.0, 4),
            balance_after=float(tx.balance_after),
            balance_after_usd=round(float(tx.balance_after) / 1000.0, 2),
            transaction_type=tx.transaction_type,
            description=tx.description,
            granted_by_user_id=tx.granted_by_user_id,
            created_at=tx.created_at,
        )
        for tx in txs
    ]


@router.post("/admin/adjust", response_model=WalletResponse)
async def admin_adjust_credits(
    req: AdjustCreditsRequest,
    db: AsyncSession = Depends(get_db),
    admin_auth: str = Depends(require_super_admin),
) -> WalletResponse:
    """Super-Admin endpoint to grant promotional credits or adjust an organization balance."""
    wallet = await BillingEngine.adjust_credits(
        session=db,
        organization_id=req.organization_id,
        amount=req.amount,
        description=req.description,
        granted_by="superadmin",
    )

    return WalletResponse(
        id=wallet.id,
        organization_id=wallet.organization_id,
        balance_credits=float(wallet.balance_credits),
        balance_usd=wallet.balance_usd,
        lifetime_granted=float(wallet.lifetime_granted),
        lifetime_consumed=float(wallet.lifetime_consumed),
        low_balance_threshold=float(wallet.low_balance_threshold),
        is_low_balance=wallet.is_low_balance,
        is_active=wallet.is_active,
        created_at=wallet.created_at,
        updated_at=wallet.updated_at,
    )
