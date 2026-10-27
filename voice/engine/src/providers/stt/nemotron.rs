//! Nemotron Streaming STT provider — bidirectional streaming WebSocket speech-to-text
//! powered by NVIDIA Nemotron 3.5 / FastConformer via parakeet-rs (`etoil-rust-stt-service`).
//!
//! # Protocol & Architecture
//!
//! - Connection: `ws://<host>:8099/v1/realtime?language={lang}&sample_rate=16000`
//! - Audio: Direct raw 16 kHz PCM-16 LE binary WebSocket frames (`Message::Binary`)
//! - Finalize: Client sends `{"type":"flush"}` to flush trailing lookahead tokens (right-context)
//! - Incoming events:
//!   - `{"type":"ready", "model":..., "supported_languages":[...]}`
//!   - `{"type":"partial", "text":..., "accumulated_text":...}` -> PartialTranscript
//!   - `{"type":"transcript", "text":..., "is_final":true}` -> Final Transcript
//!   - `{"type":"final", "text":...}` -> Final Transcript
//!   - `{"type":"reset"}` -> Clears server buffers & resets model cache
//!
//! Ref: <etoil-rust-stt-service>

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
use tracing::{debug, info, warn};

use crate::providers::ws::{ManagedWsConnection, WsConfig, WsKeepalive, WsStatus};
use crate::types::SttEvent;

use super::SttProvider;

// ── Wire Protocol Types ──────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum InboundWsMessage {
    #[serde(rename = "ready")]
    Ready {
        #[serde(default)]
        model: Option<String>,
        #[serde(default)]
        supported_languages: Option<Vec<String>>,
    },
    #[serde(rename = "partial")]
    Partial {
        #[serde(default)]
        text: Option<String>,
        #[serde(default)]
        accumulated_text: Option<String>,
        #[serde(default)]
        confidence: Option<f32>,
        #[serde(default)]
        timestamp: Option<f64>,
    },
    #[serde(rename = "transcript")]
    Transcript {
        #[serde(default)]
        text: String,
        #[serde(default)]
        is_final: bool,
        #[serde(default)]
        finalize: Option<bool>,
    },
    #[serde(rename = "final")]
    Final {
        #[serde(default)]
        text: String,
        #[serde(default)]
        confidence: Option<f32>,
        #[serde(default)]
        timestamp: Option<f64>,
        #[serde(default)]
        processing_time: Option<f64>,
    },
    #[serde(rename = "speech_started")]
    SpeechStarted {
        #[serde(default)]
        timestamp: Option<f64>,
    },
    #[serde(rename = "speech_ended")]
    SpeechEnded {
        #[serde(default)]
        timestamp: Option<f64>,
    },
    #[serde(rename = "error")]
    Error {
        #[serde(default)]
        message: String,
    },
    #[serde(other)]
    Unknown,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Resolves and normalizes the WebSocket Realtime endpoint URL.
pub fn resolve_nemotron_ws_url(base_url: &str, language: &str) -> String {
    let raw = if !base_url.is_empty() {
        base_url.to_string()
    } else {
        std::env::var("NEMOTRON_STT_URL")
            .or_else(|_| std::env::var("ETOIL_STT_URL"))
            .or_else(|_| std::env::var("CANARY_STT_URL"))
            .or_else(|_| std::env::var("STT_BASE_URL"))
            .unwrap_or_else(|_| "https://stt-staging.atekervoices.com".to_string())
    };

    let mut url = raw.trim().to_string();
    if url.starts_with("http://") {
        url = format!("ws://{}", &url[7..]);
    } else if url.starts_with("https://") {
        url = format!("wss://{}", &url[8..]);
    } else if !url.starts_with("ws://") && !url.starts_with("wss://") {
        url = format!("ws://{}", url);
    }
    url = url.trim_end_matches('/').to_string();

    let lang = if language.is_empty() { "auto" } else { language };

    if url.ends_with("/v1/realtime") || url.ends_with("/realtime") {
        if url.contains('?') {
            format!("{}&language={}&sample_rate=16000", url, lang)
        } else {
            format!("{}?language={}&sample_rate=16000", url, lang)
        }
    } else if url.ends_with("/v1") {
        format!("{}/realtime?language={}&sample_rate=16000", url, lang)
    } else {
        format!("{}/v1/realtime?language={}&sample_rate=16000", url, lang)
    }
}

/// Suppresses standard ASR hallucinations on silence / non-speech.
fn sanitize_transcript(text: &str) -> String {
    let trimmed = text.trim();
    let lower = trimmed.to_lowercase();
    if lower.contains("subtitles by")
        || lower.contains("amara.org")
        || lower.contains("community subtitles")
        || lower.contains("thank you for watching")
        || lower.contains("subscribe to my channel")
        || lower == "."
        || lower == "-"
        || lower == "..."
    {
        debug!("[nemotron-stt] Suppressed hallucination: \"{}\"", text);
        String::new()
    } else {
        trimmed.to_string()
    }
}

// ── NemotronSttProvider ──────────────────────────────────────────────────────

pub struct NemotronSttProvider {
    base_url: String,
    api_key: SecretString,
    model: String,
    language: String,
    conn_msg_tx: Option<mpsc::UnboundedSender<Message>>,
    result_rx: Option<mpsc::Receiver<SttEvent>>,
    result_tx: Option<mpsc::Sender<SttEvent>>,
    finalize_pending: Arc<AtomicBool>,
    has_speech_in_turn: Arc<AtomicBool>,
}

impl NemotronSttProvider {
    pub fn new(base_url: &str, api_key: &str, model: &str, language: &str) -> Self {
        let model = if model.is_empty() {
            "phosai-streaming-voice-v1".to_string()
        } else {
            model.to_string()
        };

        Self {
            base_url: base_url.to_string(),
            api_key: SecretString::from(api_key.to_string()),
            model,
            language: language.to_string(),
            conn_msg_tx: None,
            result_rx: None,
            result_tx: None,
            finalize_pending: Arc::new(AtomicBool::new(false)),
            has_speech_in_turn: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl SttProvider for NemotronSttProvider {
    fn provider_name(&self) -> &str {
        "nemotron"
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let ws_url = resolve_nemotron_ws_url(&self.base_url, &self.language);
        let api_key = self.api_key.expose_secret().to_string();
        let model = self.model.clone();
        let language = self.language.clone();

        info!(
            "[nemotron-stt] Connecting to streaming ASR (url={}, model={}, lang={})",
            ws_url, model, language
        );

        let url_clone = ws_url.clone();
        let conn = ManagedWsConnection::connect(
            move || {
                let mut req = url_clone
                    .clone()
                    .into_client_request()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })?;
                let headers = req.headers_mut();
                if !api_key.is_empty() && api_key != "none" {
                    headers.insert(
                        "Authorization",
                        format!("Bearer {}", api_key).parse().map_err(
                            |e: tokio_tungstenite::tungstenite::http::header::InvalidHeaderValue| {
                                Box::new(e) as Box<dyn std::error::Error + Send + Sync>
                            },
                        )?,
                    );
                }
                Ok(req)
            },
            WsConfig {
                keepalive: WsKeepalive::WsPing {
                    interval: Duration::from_secs(15),
                },
                max_reconnect_attempts: 5,
                reconnect_delay: Duration::from_millis(500),
                max_total_reconnect_rounds: 10,
            },
        )
        .await
        .map_err(|e| -> Box<dyn std::error::Error> { e })?;

        let ManagedWsConnection {
            msg_tx,
            mut incoming_rx,
            status_rx,
            ..
        } = conn;

        let (result_tx, result_rx) = mpsc::channel::<SttEvent>(32);
        self.conn_msg_tx = Some(msg_tx);
        self.result_rx = Some(result_rx);
        self.result_tx = Some(result_tx.clone());

        let finalize_pending = Arc::clone(&self.finalize_pending);
        let has_speech_in_turn = Arc::clone(&self.has_speech_in_turn);

        // ── Reader Task: Parse inbound WebSocket messages ───────────
        tokio::spawn(async move {
            let mut sent_first_text = false;
            let mut last_emitted_final = String::new();
            let mut last_emitted_partial = String::new();

            while let Some(msg) = incoming_rx.recv().await {
                if let Message::Text(text) = msg {
                    let inbound = match serde_json::from_str::<InboundWsMessage>(&text) {
                        Ok(m) => m,
                        Err(e) => {
                            debug!("[nemotron-stt] Non-conforming text frame: {} (err: {})", text, e);
                            continue;
                        }
                    };

                    match inbound {
                        InboundWsMessage::Ready { model, supported_languages } => {
                            info!(
                                "[nemotron-stt] Service ready: model={:?}, supported_langs count={}",
                                model,
                                supported_languages.as_ref().map(|v| v.len()).unwrap_or(0)
                            );
                        }

                        InboundWsMessage::Partial { text, accumulated_text, .. } => {
                            let display = accumulated_text
                                .filter(|s| !s.trim().is_empty())
                                .or(text)
                                .unwrap_or_default();
                            let clean = sanitize_transcript(&display);

                            if !clean.is_empty() && clean != last_emitted_partial {
                                last_emitted_partial = clean.clone();
                                has_speech_in_turn.store(true, Ordering::Relaxed);
                                if !sent_first_text {
                                    sent_first_text = true;
                                    let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                }
                                let _ = result_tx.send(SttEvent::PartialTranscript(clean)).await;
                            }
                        }

                        InboundWsMessage::Transcript { text, is_final, .. } => {
                            let clean = sanitize_transcript(&text);

                            if !is_final {
                                if !clean.is_empty() && clean != last_emitted_partial {
                                    last_emitted_partial = clean.clone();
                                    has_speech_in_turn.store(true, Ordering::Relaxed);
                                    if !sent_first_text {
                                        sent_first_text = true;
                                        let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                    }
                                    let _ = result_tx.send(SttEvent::PartialTranscript(clean)).await;
                                }
                            } else {
                                // Final transcript event
                                finalize_pending.store(false, Ordering::SeqCst);
                                sent_first_text = false;
                                last_emitted_partial.clear();
                                if clean != last_emitted_final {
                                    last_emitted_final = clean.clone();
                                    info!("[nemotron-stt] Final Transcript: \"{}\"", clean);
                                    let _ = result_tx.send(SttEvent::Transcript(clean)).await;
                                }
                            }
                        }

                        InboundWsMessage::Final { text, .. } => {
                            let clean = sanitize_transcript(&text);
                            finalize_pending.store(false, Ordering::SeqCst);
                            sent_first_text = false;
                            last_emitted_partial.clear();

                            if clean != last_emitted_final {
                                last_emitted_final = clean.clone();
                                info!("[nemotron-stt] Final (utterance boundary): \"{}\"", clean);
                                let _ = result_tx.send(SttEvent::Transcript(clean)).await;
                            }
                        }

                        InboundWsMessage::SpeechStarted { .. } => {
                            debug!("[nemotron-stt] Server VAD speech started");
                            has_speech_in_turn.store(true, Ordering::Relaxed);
                            sent_first_text = false;
                            last_emitted_partial.clear();
                            last_emitted_final.clear();
                        }

                        InboundWsMessage::SpeechEnded { .. } => {
                            debug!("[nemotron-stt] Server VAD speech ended");
                        }

                        InboundWsMessage::Error { message } => {
                            warn!("[nemotron-stt] Server reported error: {}", message);
                            let _ = result_tx.send(SttEvent::Error(message)).await;
                        }

                        InboundWsMessage::Unknown => {}
                    }
                }
            }

            // Connection lost
            let disconnect_reason = match status_rx.borrow().clone() {
                WsStatus::Disconnected { reason } => Some(reason),
                _ => None,
            };
            if let Some(reason) = disconnect_reason {
                let _ = result_tx
                    .send(SttEvent::Error(format!("Nemotron STT WS disconnected: {}", reason)))
                    .await;
            }
        });

        info!("[nemotron-stt] Ready (url={}, model={}, lang={})", ws_url, self.model, self.language);
        Ok(())
    }

    /// Feed audio bytes directly as raw 16 kHz PCM-16 LE binary WebSocket frames.
    fn feed_audio(&self, audio: &[u8]) {
        if audio.is_empty() {
            return;
        }
        self.has_speech_in_turn.store(true, Ordering::Relaxed);
        if let Some(tx) = &self.conn_msg_tx {
            let _ = tx.send(Message::Binary(audio.to_vec().into()));
        }
    }

    /// Flush lookahead cache and commit utterance to receive final transcript.
    fn finalize(&self) {
        self.finalize_pending.store(true, Ordering::SeqCst);

        if let Some(tx) = &self.conn_msg_tx {
            let _ = tx.send(Message::Text(r#"{"type":"flush"}"#.to_string().into()));
        }

        // Safety fallback timer:
        // If no speech occurred or server returns no tokens on flush,
        // ensure a final empty transcript is delivered so the Reactor
        // never hangs waiting for the turn to complete.
        let had_speech = self.has_speech_in_turn.swap(false, Ordering::SeqCst);
        let finalize_pending = Arc::clone(&self.finalize_pending);
        let result_tx = self.result_tx.clone();

        tokio::spawn(async move {
            // Give server lookahead flush ~300ms to deliver final transcript
            tokio::time::sleep(Duration::from_millis(if had_speech { 350 } else { 120 })).await;
            if finalize_pending.swap(false, Ordering::SeqCst) {
                if let Some(tx) = result_tx {
                    debug!("[nemotron-stt] Finalize timeout safety fallback: emitting empty transcript");
                    let _ = tx.send(SttEvent::Transcript(String::new())).await;
                }
            }
        });
    }

    /// Cleanly reset server cache and buffers on session tear-down.
    fn close(&self) {
        if let Some(tx) = &self.conn_msg_tx {
            let _ = tx.send(Message::Text(r#"{"type":"reset"}"#.to_string().into()));
        }
    }

    fn take_result_rx(&mut self) -> Option<mpsc::Receiver<SttEvent>> {
        self.result_rx.take()
    }
}
