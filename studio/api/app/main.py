"""Voice Agent OS — Voice Agent OS.

FastAPI application entrypoint.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from app.api.admin import router as admin_router
from app.api.agents import router as agents_router
from app.api.api_keys import router as api_keys_router
from app.api.billing import router as billing_router
from app.api.builder import router as builder_router
from app.api.calls import router as calls_router
from app.api.credentials import router as credentials_router
from app.api.evaluations import router as evaluations_router
from app.api.integrations import router as integrations_router
from app.api.knowledge import router as knowledge_router
from app.api.oauth import router as oauth_router
from app.api.oauth_apps import router as oauth_apps_router
from app.api.phone_numbers import router as phone_numbers_router
from app.api.settings import router as settings_router
from app.api.stt_gateway import public_router as stt_public_router, router as stt_router
from app.api.translation_gateway import public_router as translation_public_router, router as translation_router
from app.api.tts_gateway import public_router as tts_public_router, router as tts_router
from app.api.voice_session import router as voice_router
from app.lib import get_settings
from app.lib.auth import require_api_key


class _HealthCheckFilter(logging.Filter):
    """Suppress noisy GET /api/health access log lines."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return "GET /api/health" not in msg


logging.getLogger("uvicorn.access").addFilter(_HealthCheckFilter())

# Apply runtime patch for pydantic-ai OpenRouter validation to allow "standard" service_tier
try:
    from pydantic_ai.models.openrouter import _OpenRouterChatCompletionChunk
    _OpenRouterChatCompletionChunk.model_fields['service_tier'].annotation = str | None  # type: ignore[assignment]
    _OpenRouterChatCompletionChunk.model_rebuild(force=True)
except ImportError:
    pass

VERSION = "0.2.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle — startup and shutdown."""
    settings = get_settings()

    # Guard against running production with the default secret key
    if settings.is_production and "dev-secret" in settings.auth.secret_key:
        raise RuntimeError(
            "Refusing to start in production with the default secret key. "
            "Set AUTH__SECRET_KEY in your environment."
        )


    # NOTE: The voice-server binary runs as a separate process and owns
    # port 8300. Python no longer starts or stops the embedded Rust server.

    logger.info("Voice Agent OS starting in {} mode", settings.environment)
    
    # Pre-warm FastEmbed neural model in background for instantaneous voice query lookups
    try:
        import asyncio
        from app.services.knowledge_service import warm_embedding_model
        asyncio.create_task(asyncio.to_thread(warm_embedding_model))
    except Exception as e:
        logger.warning(f"Could not trigger FastEmbed warm-up: {e}")

    yield

    logger.info("Voice Agent OS shutting down")


app = FastAPI(
    title="Voice Agent OS",
    description="Open-source Voice Agent OS for business back office",
    version=VERSION,
    lifespan=lifespan,
)

# ── CORS — driven by settings ────────────────────────────────────
settings = get_settings()
_cors_origins = list(settings.allowed_origins)
for _origin in [
    "http://localhost:7970",
    "http://127.0.0.1:7970",
    "https://docs.atekervoices.com",
    "https://docs.phosaico.com",
]:
    if _origin not in _cors_origins:
        _cors_origins.append(_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Units-Metered",
        "X-Credits-Deducted",
        "X-Credits-Remaining",
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "X-RateLimit-Reset",
    ],
)

# ── Authenticated routes (require API key) ───────────────────────
_auth = [Depends(require_api_key)]

app.include_router(admin_router, prefix="/api")
app.include_router(agents_router, prefix="/api", dependencies=_auth)
app.include_router(api_keys_router, prefix="/api", dependencies=_auth, include_in_schema=False)
app.include_router(api_keys_router, prefix="/v1", dependencies=_auth)
app.include_router(billing_router, prefix="/api", dependencies=_auth, include_in_schema=False)
app.include_router(billing_router, prefix="/v1", dependencies=_auth)
app.include_router(builder_router, prefix="/api", dependencies=_auth)
app.include_router(calls_router, prefix="/api", dependencies=_auth)
app.include_router(credentials_router, prefix="/api", dependencies=_auth)
app.include_router(integrations_router, prefix="/api", dependencies=_auth)
app.include_router(evaluations_router, prefix="/api", dependencies=_auth)
app.include_router(settings_router, prefix="/api", dependencies=_auth)
app.include_router(phone_numbers_router, prefix="/api", dependencies=_auth)
# OAuth routes: authorize needs auth (user-initiated), callback is public
# (browser popup redirect from OAuth provider has no API key header)
app.include_router(oauth_router, prefix="/api")
app.include_router(oauth_apps_router, prefix="/api", dependencies=_auth)
app.include_router(knowledge_router, prefix="/api")

# ── Speech-to-Text & Neural Translation Gateway (API Key & Credit Enforcement) ──
app.include_router(stt_public_router, prefix="/v1")
app.include_router(stt_public_router, prefix="/api", include_in_schema=False)
app.include_router(stt_router, prefix="/v1", dependencies=_auth)
app.include_router(stt_router, prefix="/api", dependencies=_auth, include_in_schema=False)

app.include_router(translation_public_router, prefix="/v1")
app.include_router(translation_public_router, prefix="/api", include_in_schema=False)
app.include_router(translation_public_router, include_in_schema=False)
app.include_router(translation_router, prefix="/v1", dependencies=_auth)
app.include_router(translation_router, prefix="/api", dependencies=_auth, include_in_schema=False)
app.include_router(translation_router, dependencies=_auth, include_in_schema=False)

# ── Text-to-Speech Gateway (API Key & Credit Enforcement) ──
app.include_router(tts_public_router, prefix="/v1")
app.include_router(tts_public_router, prefix="/api", include_in_schema=False)
app.include_router(tts_router, prefix="/v1", dependencies=_auth)
app.include_router(tts_router, prefix="/api", dependencies=_auth, include_in_schema=False)

# ── WebSocket routes (auth handled inside the handler via query params,
#    because browsers cannot send custom HTTP headers on WS upgrades) ──
app.include_router(voice_router, prefix="/api")

# NOTE: Twilio/Telnyx webhooks are handled by voice-server directly.


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint (unauthenticated)."""
    return {
        "status": "healthy",
        "service": "studio-api",
        "version": VERSION,
    }
