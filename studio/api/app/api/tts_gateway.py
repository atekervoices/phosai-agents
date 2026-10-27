"""TTS Gateway API — Metered Text-to-Speech Proxy with API Key & Credit Enforcement."""

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

router = APIRouter(tags=["Text to Speech"])
public_router = APIRouter(tags=["Text to Speech"])


def _get_tts_backend_url() -> str:
    """Get the upstream TTS backend URL."""
    env_url = os.getenv("TTS_SERVICE_URL") or os.getenv("SPARK_TTS_URL")
    if env_url:
        return env_url.rstrip("/")
    return "https://tts.atekervoices.com"


@public_router.get("/tts/health", include_in_schema=False)
async def tts_health() -> dict[str, Any]:
    """Check health of the upstream TTS service."""
    backend_url = _get_tts_backend_url()
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
        logger.warning(f"TTS health check failed at {backend_url}: {exc}")
        return {"status": "unreachable", "error": str(exc), "upstream_url": backend_url}


@router.post("/audio/speech", summary="Synthesize Speech")
async def synthesize_speech(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    _auth: str = Depends(require_api_key),
) -> Any:
    """Synthesize text into speech with sk-phos- authentication and credit metering.
    
    Accepts JSON body:
      - text or input: Text string to synthesize
      - voice: Voice ID (e.g. pcm_female_1, swa_female_1, eng_female_1)
      - speed: Playback speed (default: 1.0)
      - response_format: 'wav', 'mp3', or 'pcm' (default: 'wav')
    
    Metered rate: 0.015 credits / character (tts_synthesis).
    """
    tenant = getattr(request.state, "tenant", None)
    org_id = tenant.organization_id if tenant and tenant.organization_id else "default"
    api_key_record = getattr(request.state, "api_key", None)
    api_key_id = api_key_record.id if api_key_record else None

    # 1. Enforce scope permission
    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "tts" not in api_key_record.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key does not have the 'tts' scope enabled.",
            )

    # 2. Check organization wallet balance
    has_credits, balance = await BillingEngine.check_balance(db, org_id)
    if not has_credits or balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Insufficient platform credits (Balance: {balance:.2f}). Please top up your wallet in the console.",
        )

    # 3. Parse request payload
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload.",
        )

    text = body.get("text") or body.get("input") or ""
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field 'text' or 'input' must not be empty.",
        )

    char_count = len(text)
    backend_url = _get_tts_backend_url()

    # 4. Proxy request to upstream TTS engine
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/v1/tts",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "PhosAI-Gateway/1.0",
                },
            )
    except httpx.ConnectError:
        logger.error(f"TTS backend unreachable at {backend_url}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TTS synthesis service is temporarily offline or unreachable.",
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="TTS synthesis request timed out.",
        )
    except Exception as exc:
        logger.error(f"TTS proxy error: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS gateway failed to communicate with upstream engine: {str(exc)}",
        )

    if upstream_resp.status_code != 200:
        content_type = upstream_resp.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                err_body = upstream_resp.json()
                detail = err_body.get("detail") or err_body.get("error") or err_body
            except Exception:
                detail = upstream_resp.text
        else:
            detail = upstream_resp.text or f"Upstream error {upstream_resp.status_code}"

        raise HTTPException(status_code=upstream_resp.status_code, detail=detail)

    # 5. Deduct usage on successful synthesis
    try:
        rate = RATE_CARD.get("tts_synthesis", {}).get("rate", 0.015)
        deducted = round(float(char_count) * rate, 4)
        new_balance = await BillingEngine.deduct_usage(
            session=db,
            organization_id=org_id,
            service_type="tts_synthesis",
            endpoint="/v1/tts/synthesize",
            units=float(char_count),
            metadata={
                "chars": char_count,
                "voice": body.get("voice"),
                "api_key_id": str(api_key_id) if api_key_id else None,
            },
            api_key_id=api_key_id,
        )
        response.headers["X-Units-Metered"] = f"{char_count} chars"
        response.headers["X-Credits-Deducted"] = f"{deducted:.4f}"
        response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"
    except Exception as exc:
        logger.error(f"Failed to record TTS usage deduction: {exc}")

    # 6. Stream back audio response
    content_type = upstream_resp.headers.get("content-type", "audio/wav")
    return Response(content=upstream_resp.content, media_type=content_type, headers=dict(response.headers))
