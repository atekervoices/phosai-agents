"""TTS Gateway API — Metered Text-to-Speech Proxy with API Key & Credit Enforcement."""

from __future__ import annotations

import asyncio
import io
import json
import os
import ssl
from typing import Any
import wave
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import websockets

from app.lib import get_settings
from app.lib.auth import require_api_key
from app.lib.database import async_session, get_db
from app.models.api_key import APIKey, SecureAPIKeyEngine
from app.models.billing import BillingEngine, RATE_CARD

router = APIRouter(tags=["Text to Speech"])
public_router = APIRouter(tags=["Text to Speech"])


def _get_tts_backend_url() -> str:
    """Get the upstream TTS backend URL."""
    env_url = os.getenv("TTS_SERVICE_URL") or os.getenv("SPARK_TTS_URL")
    if env_url:
        return env_url.rstrip("/")
    return "https://tts.atekervoices.com"


def _pcm_to_wav(pcm_bytes: bytes, sample_rate: int = 16000, channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap raw Linear PCM audio bytes in a standard RIFF WAV container."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)
    return buffer.getvalue()


VOICE_CATALOG = [
    # Nigerian Pidgin
    {"id": "pcm_female_1", "name": "Amara", "language": "pcm", "language_name": "Nigerian Pidgin", "gender": "female", "accent": "West African / Lagos"},
    {"id": "pcm_female_2", "name": "Blessing", "language": "pcm", "language_name": "Nigerian Pidgin", "gender": "female", "accent": "West African / Lagos"},
    {"id": "pcm_male_1", "name": "Chidi", "language": "pcm", "language_name": "Nigerian Pidgin", "gender": "male", "accent": "West African / Lagos"},
    {"id": "pcm_male_2", "name": "Emeka", "language": "pcm", "language_name": "Nigerian Pidgin", "gender": "male", "accent": "West African / Lagos"},
    # Swahili
    {"id": "swa_female_1", "name": "Amina", "language": "swa", "language_name": "Swahili", "gender": "female", "accent": "East African / Standard"},
    {"id": "swa_female_2", "name": "Zuri", "language": "swa", "language_name": "Swahili", "gender": "female", "accent": "East African / Nairobi"},
    {"id": "swa_male_3", "name": "Juma", "language": "swa", "language_name": "Swahili", "gender": "male", "accent": "East African / Standard"},
    # Luganda
    {"id": "lug_female_4", "name": "Namubiru", "language": "lug", "language_name": "Luganda", "gender": "female", "accent": "Ugandan / Central"},
    {"id": "lug_female_7", "name": "Babirye", "language": "lug", "language_name": "Luganda", "gender": "female", "accent": "Ugandan / Central"},
    {"id": "lug_male_1", "name": "Kato", "language": "lug", "language_name": "Luganda", "gender": "male", "accent": "Ugandan / Central"},
    # English
    {"id": "eng_female_1", "name": "Sarah", "language": "eng", "language_name": "English", "gender": "female", "accent": "International / Neutral"},
    {"id": "eng_male_1", "name": "David", "language": "eng", "language_name": "English", "gender": "male", "accent": "International / Neutral"},
]


@public_router.get("/tts/health", include_in_schema=False)
async def tts_health() -> dict[str, Any]:
    """Check health of the upstream TTS service."""
    backend_url = _get_tts_backend_url()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{backend_url}/openapi.json",
                headers={"User-Agent": "PhosAI-Gateway/1.0"},
            )
            if resp.status_code == 200:
                return {"status": "healthy", "service": "spark-tts", "upstream_url": backend_url}
            return {"status": "degraded", "upstream_code": resp.status_code, "upstream_url": backend_url}
    except Exception as exc:
        logger.warning(f"TTS health check failed at {backend_url}: {exc}")
        return {"status": "unreachable", "error": str(exc), "upstream_url": backend_url}


@public_router.get("/voices", summary="List Available Voices")
@router.get("/voices", summary="List Available Voices")
async def list_voices() -> dict[str, Any]:
    """Return all supported voice models grouped by language and gender."""
    return {"voices": VOICE_CATALOG}


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
      - voice: Voice ID (e.g. pcm_female_1, swa_female_1, lug_female_4, eng_female_1)
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

    voice = body.get("voice") or "pcm_female_1"
    response_format = (body.get("response_format") or "wav").lower()
    temperature = float(body.get("temperature", 0.7))
    char_count = len(text)
    backend_url = _get_tts_backend_url()

    # 4. Proxy request to upstream Spark-TTS engine
    upstream_payload = {
        "input": text,
        "voice": voice,
        "temperature": temperature,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            upstream_resp = await client.post(
                f"{backend_url}/v1/audio/speech/stream",
                json=upstream_payload,
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

    raw_pcm = upstream_resp.content

    # 5. Package audio format (wrap PCM in WAV header unless raw PCM is requested)
    if response_format == "pcm":
        audio_content = raw_pcm
        media_type = "audio/pcm"
    else:
        # Default or wav/mp3 fallback -> standard 16kHz 16-bit mono WAV
        audio_content = _pcm_to_wav(raw_pcm, sample_rate=16000, channels=1, sample_width=2)
        media_type = "audio/wav"

    # 6. Deduct usage on successful synthesis
    try:
        rate = RATE_CARD.get("tts_synthesis", {}).get("rate", 0.015)
        deducted = round(float(char_count) * rate, 4)
        new_balance = await BillingEngine.deduct_usage(
            session=db,
            organization_id=org_id,
            service_type="tts_synthesis",
            endpoint="/v1/audio/speech",
            units=float(char_count),
            metadata={
                "chars": char_count,
                "voice": voice,
                "api_key_id": str(api_key_id) if api_key_id else None,
            },
            api_key_id=api_key_id,
        )
        response.headers["X-Units-Metered"] = f"{char_count} chars"
        response.headers["X-Credits-Deducted"] = f"{deducted:.4f}"
        response.headers["X-Credits-Remaining"] = f"{new_balance:.4f}"
    except Exception as exc:
        logger.error(f"Failed to record TTS usage deduction: {exc}")

    # 7. Stream back audio response
    return Response(content=audio_content, media_type=media_type, headers=dict(response.headers))


@public_router.websocket("/audio/speech/stream/ws")
async def tts_streaming_ws(websocket: WebSocket) -> None:
    """Real-time streaming TTS WebSocket proxy with sk-phos- authentication and credit metering.
    
    Compatible with:
      - wss://api.atekervoices.com/v1/audio/speech/stream/ws
      - ws://localhost:8000/v1/audio/speech/stream/ws
    """
    settings = get_settings()

    # 1. Extract API key from query params or headers
    api_key = websocket.query_params.get("api_key")
    if not api_key:
        auth_hdr = websocket.headers.get("authorization") or websocket.headers.get("x-api-key")
        if auth_hdr:
            if auth_hdr.startswith("Bearer "):
                api_key = auth_hdr.split(" ", 1)[1].strip()
            else:
                api_key = auth_hdr.strip()

    org_id = "default"
    api_key_record: APIKey | None = None

    # 2. Authenticate API key
    if api_key and api_key.startswith(SecureAPIKeyEngine.PREFIX):
        parts = api_key.split("_", 1)
        if len(parts) == 2:
            prefix = parts[0]
            async with async_session() as session:
                query = select(APIKey).where(
                    APIKey.key_prefix == prefix,
                    APIKey.is_active == True,
                )
                res = await session.execute(query)
                candidates = res.scalars().all()
                for rec in candidates:
                    if SecureAPIKeyEngine.verify(api_key, rec.hashed_key):
                        api_key_record = rec
                        org_id = rec.organization_id or "default"
                        break

    # If key was provided but invalid
    if api_key and not api_key_record:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or revoked API key")
        return

    # If no key was provided in non-dev environment
    if not api_key_record and not settings.is_development:
        await websocket.close(
            code=status.WS_1008_POLICY_VIOLATION,
            reason="Missing API key. Provide via ?api_key=sk-phos- or Authorization header",
        )
        return

    # 3. Verify scope permission
    if api_key_record and hasattr(api_key_record, "scopes") and api_key_record.scopes:
        if "tts" not in api_key_record.scopes:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="API key does not have the 'tts' scope enabled",
            )
            return

    # 4. Check wallet credit balance
    async with async_session() as session:
        has_credits, balance = await BillingEngine.check_balance(session, org_id)
        if not has_credits or balance <= 0:
            await websocket.close(
                code=status.WS_1008_POLICY_VIOLATION,
                reason=f"Insufficient platform credits (Balance: {balance:.2f}). Please top up wallet.",
            )
            return

    # 5. Accept client WebSocket connection
    await websocket.accept()

    # 6. Build upstream WebSocket URL
    backend_url = _get_tts_backend_url()
    ws_base = backend_url.replace("https://", "wss://").replace("http://", "ws://")
    upstream_url = f"{ws_base}/v1/audio/speech/stream/ws"
    
    # Forward query parameters (such as default voice or sample rate)
    q_params = dict(websocket.query_params)
    q_params.pop("api_key", None)
    if q_params:
        query_str = "&".join(f"{k}={v}" for k, v in q_params.items())
        upstream_url = f"{upstream_url}?{query_str}"

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    accumulated_chars = 0

    try:
        async with websockets.connect(
            upstream_url,
            ssl=ssl_ctx if upstream_url.startswith("wss://") else None,
            ping_interval=20,
            ping_timeout=20,
        ) as upstream_ws:

            async def client_to_upstream() -> None:
                nonlocal accumulated_chars
                try:
                    while True:
                        msg = await websocket.receive()
                        if "text" in msg:
                            text_data = msg["text"]
                            try:
                                parsed = json.loads(text_data)
                                text_input = parsed.get("input") or parsed.get("text") or ""
                                if text_input:
                                    accumulated_chars += len(text_input)
                            except Exception:
                                pass
                            await upstream_ws.send(text_data)
                        elif "bytes" in msg:
                            await upstream_ws.send(msg["bytes"])
                        elif msg.get("type") == "websocket.disconnect":
                            break
                except (WebSocketDisconnect, asyncio.CancelledError):
                    pass
                except Exception as exc:
                    logger.debug(f"TTS WS client_to_upstream finished: {exc}")

            async def upstream_to_client() -> None:
                try:
                    while True:
                        resp = await upstream_ws.recv()
                        if isinstance(resp, bytes):
                            await websocket.send_bytes(resp)
                        elif isinstance(resp, str):
                            await websocket.send_text(resp)
                except (websockets.ConnectionClosed, asyncio.CancelledError):
                    pass
                except Exception as exc:
                    logger.debug(f"TTS WS upstream_to_client finished: {exc}")

            # Run client and upstream loops concurrently
            c2u_task = asyncio.create_task(client_to_upstream())
            u2c_task = asyncio.create_task(upstream_to_client())

            done, pending = await asyncio.wait(
                [c2u_task, u2c_task],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except Exception as exc:
        logger.error(f"TTS WebSocket proxy error: {exc}")
        try:
            await websocket.close(
                code=status.WS_1011_INTERNAL_ERROR,
                reason="TTS upstream synthesis engine unreachable",
            )
        except Exception:
            pass

    # 7. Deduct credits for accumulated character count
    if accumulated_chars > 0:
        try:
            async with async_session() as session:
                rate = RATE_CARD.get("tts_synthesis", {}).get("rate", 0.015)
                await BillingEngine.deduct_usage(
                    session=session,
                    organization_id=org_id,
                    service_type="tts_synthesis",
                    endpoint="/v1/audio/speech/stream/ws",
                    units=float(accumulated_chars),
                    metadata={
                        "chars": accumulated_chars,
                        "protocol": "websocket",
                        "api_key_id": str(api_key_record.id) if api_key_record else None,
                    },
                    api_key_id=api_key_record.id if api_key_record else None,
                )
                logger.info(
                    f"Deducted {accumulated_chars * rate:.4f} credits for {accumulated_chars} chars on WS stream (org: {org_id})"
                )
        except Exception as exc:
            logger.error(f"Failed to record WS TTS usage deduction: {exc}")

