"""STT Gateway API — Metered Speech-to-Text Proxy with API Key & Credit Enforcement."""

from __future__ import annotations

import os
from typing import Any
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.auth import require_api_key
from app.lib.database import get_db
from app.models.billing import BillingEngine, RATE_CARD

router = APIRouter(tags=["Speech to Text"])
public_router = APIRouter(tags=["Speech to Text"])


def _get_stt_backend_url() -> str:
    """Get the upstream STT backend URL.
    
    Defaults to https://stt-staging.atekervoices.com
    """
    env_url = os.getenv("STT_SERVICE_URL") or os.getenv("NEMOTRON_STT_URL")
    if env_url:
        return env_url.rstrip("/")
    return "https://stt-staging.atekervoices.com"


@public_router.get("/transcribe/health")
@public_router.get("/stt/health")
async def stt_health() -> dict[str, Any]:
    """Check health and model readiness of the upstream STT engine."""
    backend_url = _get_stt_backend_url()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{backend_url}/health",
                headers={"User-Agent": "PhosAI-Gateway/1.0"},
            )
            if resp.status_code == 200:
                return resp.json()
            return {"status": "degraded", "upstream_code": resp.status_code, "upstream_url": backend_url}
    except Exception as exc:
        logger.warning(f"STT health check failed at {backend_url}: {exc}")
        return {"status": "unreachable", "error": str(exc), "upstream_url": backend_url}


@router.post("/transcribe")
@router.post("/audio/transcriptions")
async def transcribe_audio(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> Any:
    """Synchronous audio transcription with sk-phos- authentication and credit metering.
    
    Accepts raw 16-bit PCM/WAV binary or multipart/form-data.
    Metered rate: 0.08 credits / audio second (stt_batch).
    """
    tenant = getattr(request.state, "tenant", None)
    org_id = tenant.organization_id if tenant and tenant.organization_id else "default"
    api_key_record = getattr(request.state, "api_key", None)
    api_key_id = api_key_record.id if api_key_record else None

    # 1. Enforce scope permission
    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "stt" not in api_key_record.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key lacks required 'stt' scope permission.",
            )

    # 2. Check credit balance
    has_credits, balance = await BillingEngine.check_balance(db, org_id)
    if not has_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient platform credit balance ({balance:.2f} credits). Please top up your wallet in the console.",
        )

    # 3. Read raw incoming body and headers
    body = await request.body()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request body cannot be empty. Please provide WAV or PCM audio bytes.",
        )

    content_type = request.headers.get("content-type", "audio/wav")
    query_params = dict(request.query_params)
    backend_url = _get_stt_backend_url()

    # 4. Proxy to upstream STT inference engine
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/v1/transcribe",
                params=query_params,
                content=body,
                headers={
                    "content-type": content_type,
                    "accept": "application/json",
                    "User-Agent": "PhosAI-Gateway/1.0",
                },
            )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Speech-to-Text inference service is unreachable at {backend_url}.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Speech-to-Text inference request timed out.",
        )

    if upstream_resp.status_code != 200:
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type="application/json",
        )

    try:
        data = upstream_resp.json()
    except Exception:
        return Response(
            content=upstream_resp.content,
            status_code=200,
            media_type="application/json",
        )

    # 5. Determine metered duration
    audio_duration = 0.0
    if isinstance(data, dict):
        audio_duration = float(data.get("audio_duration") or 0.0)
    elif isinstance(data, list):
        audio_duration = sum(float(item.get("audio_duration") or 0.0) for item in data if isinstance(item, dict))

    # Fallback duration if upstream didn't populate (assume 16kHz 16-bit mono PCM: 32000 bytes/sec)
    if audio_duration <= 0.0:
        audio_duration = max(0.1, round(len(body) / 32000.0, 2))

    # 6. Deduct credits from organization wallet
    rate = RATE_CARD.get("stt", {}).get("rate", 0.08)
    cost = round(audio_duration * rate, 4)
    new_balance = await BillingEngine.deduct_usage(
        session=db,
        organization_id=org_id,
        service_type="stt",
        endpoint="/v1/transcribe",
        units=audio_duration,
        api_key_id=api_key_id,
        metadata={
            "language": data.get("language") if isinstance(data, dict) else query_params.get("language"),
            "processing_time": data.get("processing_time") if isinstance(data, dict) else None,
            "real_time_factor": data.get("real_time_factor") if isinstance(data, dict) else None,
        },
    )

    response.headers["X-Units-Metered"] = f"{audio_duration:.2f}s"
    response.headers["X-Credits-Deducted"] = f"{cost:.4f}"
    response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"

    return data


@router.post("/transcribe/batch")
async def transcribe_batch_audio(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> Any:
    """Batch audio transcription with multipart upload and credit metering."""
    tenant = getattr(request.state, "tenant", None)
    org_id = tenant.organization_id if tenant and tenant.organization_id else "default"
    api_key_record = getattr(request.state, "api_key", None)
    api_key_id = api_key_record.id if api_key_record else None

    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "stt" not in api_key_record.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key lacks required 'stt' scope permission.",
            )

    has_credits, balance = await BillingEngine.check_balance(db, org_id)
    if not has_credits:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient platform credit balance ({balance:.2f} credits). Please top up your wallet in the console.",
        )

    body = await request.body()
    content_type = request.headers.get("content-type", "")
    query_params = dict(request.query_params)
    backend_url = _get_stt_backend_url()

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/v1/transcribe/batch",
                params=query_params,
                content=body,
                headers={
                    "content-type": content_type,
                    "accept": "application/json",
                    "User-Agent": "PhosAI-Gateway/1.0",
                },
            )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"STT batch service error: {exc}",
        )

    if upstream_resp.status_code != 200:
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type="application/json",
        )

    data = upstream_resp.json()
    total_duration = 0.0
    if isinstance(data, dict):
        results = data.get("results", [])
        total_duration = sum(float(r.get("audio_duration") or 0.0) for r in results if isinstance(r, dict))

    if total_duration <= 0.0:
        total_duration = max(0.5, round(len(body) / 32000.0, 2))

    rate = RATE_CARD.get("stt_batch", {}).get("rate", 0.08)
    cost = round(total_duration * rate, 4)
    new_balance = await BillingEngine.deduct_usage(
        session=db,
        organization_id=org_id,
        service_type="stt_batch",
        endpoint="/v1/transcribe/batch",
        units=total_duration,
        api_key_id=api_key_id,
        metadata={"total_files": data.get("total_files") if isinstance(data, dict) else len(results)},
    )

    response.headers["X-Units-Metered"] = f"{total_duration:.2f}s"
    response.headers["X-Credits-Deducted"] = f"{cost:.4f}"
    response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"

    return data
