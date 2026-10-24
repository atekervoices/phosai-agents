from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, JSON, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.lib.database import Base


class APIKey(Base):
    """API Key database model for PhosAI & Ateker Voices.
    
    Keys follow the OpenAI-style format:
        sk-phos-<lookup_id>_<secret_entropy>
    
    Security:
      - Raw key is never stored in plaintext.
      - Database stores only the SHA-256 hash.
      - Fast O(1) indexed lookup by key_prefix (sk-phos-<lookup_id>).
      - Timing-safe comparison using hmac.compare_digest.
    """

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Fast indexed lookup prefix: "sk-phos-<8 hex chars>"
    key_prefix: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # SHA-256 hash of the entire raw key (64 hex characters)
    hashed_key: Mapped[str] = mapped_column(String(64), nullable=False)

    # Masked representation for the dashboard UI (e.g. "sk-phos-a1b2...5vWx")
    masked_key: Mapped[str] = mapped_column(String(40), nullable=False)

    # Scopes: ["stt", "tts", "translate", "agents"]
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    def __repr__(self) -> str:
        return f"<APIKey {self.name} ({self.masked_key}) org={self.organization_id}>"


class SecureAPIKeyEngine:
    """CSPRNG-based API Key generator and validator matching top industry standards."""

    PREFIX = "sk-phos-"

    @classmethod
    def generate_key(cls, name: str = "Default") -> dict[str, str]:
        """Generates a cryptographically secure API key using OS kernel entropy.
        
        Returns:
            dict with:
                raw_key: Full string (returned to user ONCE)
                key_prefix: Indexed lookup prefix (stored in DB)
                hashed_key: SHA-256 hash (stored in DB)
                masked_key: Truncated preview (stored in DB)
        """
        # 1. 8 hex characters (4 bytes) for fast O(1) DB indexing
        lookup_id = secrets.token_hex(4)

        # 2. 32 bytes (256 bits) of cryptographically secure kernel entropy
        secret_entropy = secrets.token_urlsafe(32)

        # 3. Assemble full key: sk-phos-<lookup_id>_<secret_entropy>
        full_prefix = f"{cls.PREFIX}{lookup_id}"
        raw_key = f"{full_prefix}_{secret_entropy}"

        # 4. SHA-256 cryptographic hash
        hashed_key = cls.hash_key(raw_key)

        # 5. Masked key for UI display (e.g. sk-phos-a1b2c3d4...5vWx)
        masked_key = f"{full_prefix}...{secret_entropy[-4:]}"

        return {
            "raw_key": raw_key,
            "key_prefix": full_prefix,
            "hashed_key": hashed_key,
            "masked_key": masked_key,
        }

    @staticmethod
    def hash_key(raw_key: str) -> str:
        """Returns the SHA-256 hex digest of the raw key string."""
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    @staticmethod
    def verify(raw_key: str, stored_hash: str) -> bool:
        """Timing-attack-safe constant-time comparison."""
        incoming_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
        return hmac.compare_digest(incoming_hash, stored_hash)
