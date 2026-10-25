from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
    select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.lib.database import Base


# Rate Card: Cost in credits per raw unit (1,000 credits = $1.00 USD)
RATE_CARD = {
    # 0.1 credits per audio second = 6.0 credits / min = $0.006 / min
    "stt_streaming": {"rate": 0.1, "unit": "seconds"},
    # 0.08 credits per audio second = 4.8 credits / min = $0.0048 / min
    "stt_batch": {"rate": 0.08, "unit": "seconds"},
    # 15.0 credits per 1,000 characters = $0.015 / 1k chars
    "tts_synthesis": {"rate": 0.015, "unit": "characters"},
    # 10.0 credits per 1,000 words = $0.010 / 1k words
    "translation": {"rate": 0.01, "unit": "words"},
    # 1.0 credits per call second = 60.0 credits / min = $0.06 / min
    "agent_call": {"rate": 1.0, "unit": "seconds"},
}

DEFAULT_STARTING_BALANCE = 10000.0  # $10.00 USD (10,000 platform credits)
DEFAULT_LOW_BALANCE_THRESHOLD = 1000.0  # $1.00 USD


class Wallet(Base):
    """Organization credit wallet balance and status."""

    __tablename__ = "wallets"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )

    # Balance and audit totals (stored as Numeric with 4 decimal places)
    balance_credits: Mapped[float] = mapped_column(
        Numeric(14, 4), default=DEFAULT_STARTING_BALANCE, nullable=False
    )
    lifetime_granted: Mapped[float] = mapped_column(
        Numeric(14, 4), default=DEFAULT_STARTING_BALANCE, nullable=False
    )
    lifetime_consumed: Mapped[float] = mapped_column(
        Numeric(14, 4), default=0.0, nullable=False
    )

    low_balance_threshold: Mapped[float] = mapped_column(
        Numeric(14, 4), default=DEFAULT_LOW_BALANCE_THRESHOLD, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    transactions: Mapped[list[CreditTransaction]] = relationship(
        "CreditTransaction", back_populates="wallet", cascade="all, delete-orphan"
    )
    usage_events: Mapped[list[UsageEvent]] = relationship(
        "UsageEvent", back_populates="wallet", cascade="all, delete-orphan"
    )

    @property
    def balance_usd(self) -> float:
        return round(float(self.balance_credits) / 1000.0, 2)

    @property
    def is_low_balance(self) -> bool:
        return float(self.balance_credits) <= float(self.low_balance_threshold)


class CreditTransaction(Base):
    """Immutable double-entry audit ledger for credit grants, debits, and adjustments."""

    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Positive for credits added, negative for usage debits
    amount: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    balance_after: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)

    # Transaction category: "grant", "deduction", "adjustment", "refund", "welcome_bonus"
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    granted_by_user_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    wallet: Mapped[Wallet] = relationship("Wallet", back_populates="transactions")


class UsageEvent(Base):
    """Granular record of an individual inference or streaming event."""

    __tablename__ = "usage_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    wallet_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("wallets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    api_key_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Service identifier: "stt", "tts", "translation", "agent"
    service_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(255), nullable=False)

    units_metered: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    unit_type: Mapped[str] = mapped_column(String(30), nullable=False)
    cost_credits: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    wallet: Mapped[Wallet] = relationship("Wallet", back_populates="usage_events")


class BillingEngine:
    """Core domain logic for wallets, credit verification, and atomic deductions."""

    @staticmethod
    async def get_or_create_wallet(
        session: AsyncSession, organization_id: str
    ) -> Wallet:
        """Retrieve existing wallet or initialize a new one with default welcome credits."""
        query = select(Wallet).where(Wallet.organization_id == organization_id)
        result = await session.execute(query)
        wallet = result.scalar_one_or_none()

        if wallet is not None:
            return wallet

        # Create wallet with initial welcome credits
        wallet = Wallet(
            organization_id=organization_id,
            balance_credits=DEFAULT_STARTING_BALANCE,
            lifetime_granted=DEFAULT_STARTING_BALANCE,
            lifetime_consumed=0.0,
        )
        session.add(wallet)
        await session.flush()

        # Log initial welcome grant
        tx = CreditTransaction(
            wallet_id=wallet.id,
            amount=DEFAULT_STARTING_BALANCE,
            balance_after=DEFAULT_STARTING_BALANCE,
            transaction_type="welcome_bonus",
            description="Initial Developer Tier Welcome Credit ($10.00)",
        )
        session.add(tx)
        await session.commit()
        await session.refresh(wallet)
        return wallet

    @staticmethod
    async def check_balance(
        session: AsyncSession, organization_id: str
    ) -> tuple[bool, float]:
        """Check if organization has available credits (> 0).

        Returns: (has_credits, current_balance)
        """
        query = select(Wallet.balance_credits, Wallet.is_active).where(
            Wallet.organization_id == organization_id
        )
        result = await session.execute(query)
        row = result.first()
        if not row:
            # If no wallet yet, it will be granted welcome credits on first call
            return True, DEFAULT_STARTING_BALANCE

        balance, is_active = row
        return (is_active and float(balance) > 0.0), float(balance)

    @staticmethod
    async def deduct_usage(
        session: AsyncSession,
        organization_id: str,
        service_type: str,
        endpoint: str,
        units: float,
        api_key_id: uuid.UUID | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> float:
        """Atomically calculate unit cost, deduct credits, and append audit records."""
        rate_info = RATE_CARD.get(service_type, {"rate": 0.1, "unit": "units"})
        unit_cost = rate_info["rate"]
        unit_name = rate_info["unit"]
        total_cost = round(units * unit_cost, 4)

        # Row lock wallet to prevent race condition balance overdraft
        query = (
            select(Wallet)
            .where(Wallet.organization_id == organization_id)
            .with_for_update()
        )
        result = await session.execute(query)
        wallet = result.scalar_one_or_none()

        if not wallet:
            wallet = await BillingEngine.get_or_create_wallet(session, organization_id)
            query = (
                select(Wallet)
                .where(Wallet.organization_id == organization_id)
                .with_for_update()
            )
            result = await session.execute(query)
            wallet = result.scalar_one()

        current_balance = float(wallet.balance_credits)
        new_balance = round(current_balance - total_cost, 4)

        wallet.balance_credits = new_balance
        wallet.lifetime_consumed = round(
            float(wallet.lifetime_consumed) + total_cost, 4
        )

        # 1. Append to credit transactions ledger
        tx = CreditTransaction(
            wallet_id=wallet.id,
            amount=-total_cost,
            balance_after=new_balance,
            transaction_type="deduction",
            description=f"{service_type.upper()} usage: {units} {unit_name}",
        )
        session.add(tx)

        # 2. Append granular usage event
        event = UsageEvent(
            wallet_id=wallet.id,
            api_key_id=api_key_id,
            service_type=service_type,
            endpoint=endpoint,
            units_metered=units,
            unit_type=unit_name,
            cost_credits=total_cost,
            metadata_json=metadata or {},
        )
        session.add(event)

        await session.commit()
        return new_balance

    @staticmethod
    async def adjust_credits(
        session: AsyncSession,
        organization_id: str,
        amount: float,
        description: str,
        granted_by: str | None = None,
    ) -> Wallet:
        """Manually grant or deduct credits (Admin control plane)."""
        wallet = await BillingEngine.get_or_create_wallet(session, organization_id)

        query = (
            select(Wallet)
            .where(Wallet.organization_id == organization_id)
            .with_for_update()
        )
        result = await session.execute(query)
        wallet = result.scalar_one()

        new_balance = round(float(wallet.balance_credits) + amount, 4)
        wallet.balance_credits = new_balance
        if amount > 0:
            wallet.lifetime_granted = round(
                float(wallet.lifetime_granted) + amount, 4
            )

        tx_type = "grant" if amount >= 0 else "adjustment"
        tx = CreditTransaction(
            wallet_id=wallet.id,
            amount=amount,
            balance_after=new_balance,
            transaction_type=tx_type,
            description=description,
            granted_by_user_id=granted_by,
        )
        session.add(tx)
        await session.commit()
        await session.refresh(wallet)
        return wallet
