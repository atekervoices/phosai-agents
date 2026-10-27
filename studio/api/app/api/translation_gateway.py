"""Translation Gateway API — Metered Neural Translation with API Key & Credit Enforcement."""

from __future__ import annotations

import os
from typing import Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.auth import require_api_key
from app.lib.database import get_db
from app.models.billing import BillingEngine, RATE_CARD

router = APIRouter(tags=["Neural Translation"])
public_router = APIRouter(tags=["Neural Translation"])


def _get_translation_backend_url() -> str:
    """Get the upstream Neural Translation backend URL."""
    env_url = os.getenv("TRANSLATION_SERVICE_URL")
    if env_url:
        return env_url.rstrip("/")
    return "https://translate.atekervoices.com"


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Source sentence or paragraph to translate")
    source_lang: str = Field(..., description="ISO 639-3 or ISO 639-1 source language code (e.g. lug, eng, ach, sw)")
    target_lang: str = Field(..., description="ISO 639-3 or ISO 639-1 target language code (e.g. eng, lug, fra, es)")
    fast: bool = Field(default=True, description="Enable sub-100ms low-latency inference mode")
    beam_size: int = Field(default=1, ge=1, le=5, description="Beam search width")


class BatchTranslateRequest(BaseModel):
    texts: list[str] = Field(..., min_items=1, description="List of sentences to translate in parallel")
    source_lang: str = Field(..., description="Source language code")
    target_lang: str = Field(..., description="Target language code")
    fast: bool = Field(default=True)
    beam_size: int = Field(default=1, ge=1, le=5)


@public_router.get("/translate/health")
async def translation_health() -> dict[str, Any]:
    """Check health and device readiness of the Neural Translation engine."""
    backend_url = _get_translation_backend_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{backend_url}/health",
                headers={"User-Agent": "PhosAI-Gateway/1.0"},
            )
            if resp.status_code == 200:
                return resp.json()
            return {"status": "degraded", "upstream_code": resp.status_code, "upstream_url": backend_url}
    except Exception as exc:
        logger.warning(f"Translation health check failed at {backend_url}: {exc}")
        return {"status": "unreachable", "error": str(exc), "upstream_url": backend_url}


@public_router.get("/translate/languages")
@public_router.get("/languages")
async def list_languages() -> Any:
    """List supported African, Ugandan, and global languages (ISO 639-3 standard)."""
    backend_url = _get_translation_backend_url()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{backend_url}/languages",
                headers={"User-Agent": "PhosAI-Gateway/1.0"},
            )
            return resp.json()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not fetch languages from translation engine: {exc}",
        )


@router.post("/translate")
async def translate_text(
    payload: TranslateRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> Any:
    """Single sentence / text paragraph translation with API key and credit metering.
    
    Metered rate: 0.01 credits per word (10.0 credits per 1,000 words = $0.01 / 1k words).
    """
    tenant = getattr(request.state, "tenant", None)
    org_id = tenant.organization_id if tenant and tenant.organization_id else "default"
    api_key_record = getattr(request.state, "api_key", None)
    api_key_id = api_key_record.id if api_key_record else None

    # 1. Enforce scope permission
    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "translate" not in api_key_record.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key lacks required 'translate' scope permission.",
            )

    # 2. Check credit balance
    has_credits, balance = await BillingEngine.check_balance(db, org_id)
    if not has_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient platform credit balance ({balance:.2f} credits). Please top up your wallet in the console.",
        )

    # 3. Calculate word count for metered billing
    word_count = max(1, len(payload.text.strip().split()))
    backend_url = _get_translation_backend_url()

    # 4. Proxy to upstream Neural Translation engine
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/translate",
                json=payload.model_dump(),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "PhosAI-Gateway/1.0",
                },
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Neural Translation engine is unreachable at {backend_url}.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Neural Translation inference timed out.",
        )

    if upstream_resp.status_code != 200:
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type="application/json",
        )

    data = upstream_resp.json()

    # 5. Deduct credits from organization wallet
    rate = RATE_CARD.get("translation", {}).get("rate", 0.01)
    cost = round(word_count * rate, 4)
    new_balance = await BillingEngine.deduct_usage(
        session=db,
        organization_id=org_id,
        service_type="translation",
        endpoint="/v1/translate",
        units=float(word_count),
        api_key_id=api_key_id,
        metadata={
            "source_lang": payload.source_lang,
            "target_lang": payload.target_lang,
            "words": word_count,
            "latency_ms": data.get("latency_ms"),
        },
    )

    response.headers["X-Units-Metered"] = f"{word_count} words"
    response.headers["X-Credits-Deducted"] = f"{cost:.4f}"
    response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"

    return data


@router.post("/translate/batch")
async def translate_batch(
    payload: BatchTranslateRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> Any:
    """Parallel batch translation with API key authentication and credit metering."""
    tenant = getattr(request.state, "tenant", None)
    org_id = tenant.organization_id if tenant and tenant.organization_id else "default"
    api_key_record = getattr(request.state, "api_key", None)
    api_key_id = api_key_record.id if api_key_record else None

    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "translate" not in api_key_record.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key lacks required 'translate' scope permission.",
            )

    has_credits, balance = await BillingEngine.check_balance(db, org_id)
    if not has_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient platform credit balance ({balance:.2f} credits). Please top up your wallet in the console.",
        )

    total_words = sum(max(1, len(t.strip().split())) for t in payload.texts)
    backend_url = _get_translation_backend_url()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/translate/batch",
                json=payload.model_dump(),
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "PhosAI-Gateway/1.0",
                },
            )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Neural Translation batch error: {exc}",
        )

    if upstream_resp.status_code != 200:
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type="application/json",
        )

    data = upstream_resp.json()

    rate = RATE_CARD.get("translation", {}).get("rate", 0.01)
    cost = round(total_words * rate, 4)
    new_balance = await BillingEngine.deduct_usage(
        session=db,
        organization_id=org_id,
        service_type="translation",
        endpoint="/v1/translate/batch",
        units=float(total_words),
        api_key_id=api_key_id,
        metadata={
            "source_lang": payload.source_lang,
            "target_lang": payload.target_lang,
            "total_sentences": len(payload.texts),
            "total_words": total_words,
            "latency_ms": data.get("latency_ms"),
        },
    )

    response.headers["X-Units-Metered"] = f"{total_words} words"
    response.headers["X-Credits-Deducted"] = f"{cost:.4f}"
    response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"

    return data
