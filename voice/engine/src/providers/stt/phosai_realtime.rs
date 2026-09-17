//! PhosAI Realtime STT provider — bidirectional streaming WebSocket speech-to-text
//! powered by Voicebox-RS / African Whisper (`/v1/realtime`).
//!
//! # Protocol & Architecture
//!
//! Connection: `wss://whisper-stt.atekervoices.com/v1/realtime?model={model}&language={language}`
//! Auth:       `Authorization: Bearer <api_key>` / `x-api-key` header (optional)
//!
//! Audio is streamed in real-time as raw 16 kHz PCM-16 LE base-64 frames:
//!   - `input_audio_buffer.append` -> sends base64 PCM frames continuously
//!   - `input_audio_buffer.commit` -> commits buffer on VAD speech-end
//!
//! Incoming events:
//!   - `conversation.item.input_audio_transcription.delta` -> PartialTranscript
//!   - `conversation.item.input_audio_transcription.completed` -> Final Transcript
//!
//! # Supported African & Regional Languages
//!
//! - `lug` (Luganda) [default]
//! - `ach` (Acholi)
//! - `teo` (Ateso)
//! - `swa` / `sw` (Swahili)
//! - `kin` / `rw` (Kinyarwanda)
//! - `lgg` (Lugbara)
//! - `nyn` (Runyankore)
//! - `xog` (Lusoga)
//! - `ttj` (Rutooro)
//! - `myx` (Lumasaba)
//! - `en` / `eng` (English - Ugandan accent)
//!
//! Ref: <https://whisper-stt.atekervoices.com/docs>

use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use secrecy::{ExposeSecret, SecretString};
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
use tracing::{debug, info, warn};

use crate::providers::ws::{ManagedWsConnection, WsConfig, WsKeepalive, WsStatus};
use crate::types::SttEvent;

use super::SttProvider;

/// Normalizes language input to standard 3-letter / supported code for African Whisper models.
pub fn normalize_phosai_language(lang: &str) -> String {
    let code = lang.trim().to_lowercase();
    match code.as_str() {
        "lg" | "lug" | "luganda" => "lug".to_string(),
        "ach" | "acholi" => "ach".to_string(),
        "teo" | "ateso" => "teo".to_string(),
        "sw" | "swa" | "swahili" => "swa".to_string(),
        "rw" | "kin" | "kinyarwanda" => "kin".to_string(),
        "lgg" | "lugbara" => "lgg".to_string(),
        "nyn" | "runyankole" | "runyankore" => "nyn".to_string(),
        "xog" | "lusoga" => "xog".to_string(),
        "ttj" | "rutooro" | "tooro" => "ttj".to_string(),
        "myx" | "lumasaba" | "masaba" => "myx".to_string(),
        "eng" | "en" | "english" => "en".to_string(),
        "" => "lug".to_string(),
        other => other.to_string(),
    }
}

/// Resolves the WebSocket Realtime endpoint URL.
fn resolve_realtime_ws_url(base_url: &str, model: &str, language: &str) -> String {
    let raw = if !base_url.is_empty()
        && !base_url.contains("control.atekervoices.com")
        && !base_url.contains("stt-control")
    {
        base_url.to_string()
    } else {
        std::env::var("PHOSAI_STT_URL")
            .or_else(|_| std::env::var("PHOSTT_URL"))
            .or_else(|_| std::env::var("VOICEBOX_STT_URL"))
            .or_else(|_| std::env::var("NEXVOX_STT_URL"))
            .unwrap_or_else(|_| "https://whisper-stt.atekervoices.com".to_string())
    };

    // Convert scheme to ws / wss
    let ws_base = if raw.starts_with("https://") {
        format!("wss://{}", raw.trim_start_matches("https://"))
    } else if raw.starts_with("http://") {
        format!("ws://{}", raw.trim_start_matches("http://"))
    } else if raw.starts_with("ws://") || raw.starts_with("wss://") {
        raw
    } else {
        format!("wss://{}", raw)
    };

    let trimmed = ws_base
        .trim_end_matches('/')
        .trim_end_matches("/audio/transcriptions")
        .trim_end_matches("/realtime")
        .trim_end_matches("/v1");

    format!("{trimmed}/v1/realtime?model={model}&language={language}")
}

/// Resolves the STT API key.
fn resolve_realtime_api_key(api_key: &str) -> SecretString {
    let resolved = if !api_key.is_empty() && api_key != "none" {
        api_key.to_string()
    } else {
        std::env::var("PHOSAI_STT_API_KEY")
            .or_else(|_| std::env::var("PHOSTT_API_KEY"))
            .or_else(|_| std::env::var("VOICEBOX_API_KEY"))
            .or_else(|_| std::env::var("NEXVOX_API_KEY"))
            .unwrap_or_else(|_| "none".to_string())
    };
    SecretString::from(resolved)
}

/// Streaming Real-Time STT via PhosAI / Voicebox-RS `/v1/realtime` WebSocket API.
pub struct PhosaiRealtimeSttProvider {
    api_key: SecretString,
    model: String,
    language: String,
    base_url: String,
    /// Sends messages to the managed WS connection.
    conn_msg_tx: Option<mpsc::UnboundedSender<Message>>,
    result_rx: Option<mpsc::Receiver<SttEvent>>,
    /// Non-blocking channel for raw 16kHz PCM audio frames.
    audio_tx: Option<mpsc::UnboundedSender<Vec<u8>>>,
}

impl PhosaiRealtimeSttProvider {
    pub fn new(base_url: &str, api_key: &str, model: &str, language: &str) -> Self {
        let model = if model.is_empty() {
            "phosai-stt-v1".to_string()
        } else {
            model.to_string()
        };
        let language = normalize_phosai_language(language);
        let api_key = resolve_realtime_api_key(api_key);

        Self {
            api_key,
            model,
            language,
            base_url: base_url.to_string(),
            conn_msg_tx: None,
            result_rx: None,
            audio_tx: None,
        }
    }
}

#[async_trait]
impl SttProvider for PhosaiRealtimeSttProvider {
    fn provider_name(&self) -> &str {
        "phosai-stt"
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let ws_url = resolve_realtime_ws_url(&self.base_url, &self.model, &self.language);
        let api_key = self.api_key.expose_secret().to_string();
        let model = self.model.clone();
        let language = self.language.clone();

        info!(
            "[phosai-realtime-stt] Connecting (url={}, model={}, lang={})",
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
                    headers.insert(
                        "x-api-key",
                        api_key.parse().map_err(
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
                    interval: std::time::Duration::from_secs(15),
                },
                max_reconnect_attempts: 5,
                reconnect_delay: std::time::Duration::from_millis(500),
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
        let reply_tx = msg_tx.clone();

        // ── Audio encode & stream task ──────────────────────────────────
        // Reads raw 16 kHz PCM frames from `audio_tx`, base64 encodes, and sends
        // `input_audio_buffer.append` message directly. Zero resampling overhead!
        let (audio_tx, mut audio_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let ws_tx_for_audio = msg_tx.clone();
        tokio::spawn(async move {
            while let Some(pcm) = audio_rx.recv().await {
                if pcm.is_empty() {
                    continue;
                }
                let b64 = BASE64.encode(&pcm);
                let msg = json!({
                    "type": "input_audio_buffer.append",
                    "audio": b64
                });
                if ws_tx_for_audio
                    .send(Message::Text(msg.to_string().into()))
                    .is_err()
                {
                    break;
                }
            }
        });

        self.conn_msg_tx = Some(msg_tx);
        self.result_rx = Some(result_rx);
        self.audio_tx = Some(audio_tx);

        // ── Reader task ─────────────────────────────────────────────────
        tokio::spawn(async move {
            let mut sent_first_text = false;

            while let Some(msg) = incoming_rx.recv().await {
                if let Message::Text(text) = msg {
                    let Ok(event) = serde_json::from_str::<Value>(&text) else {
                        debug!("[phosai-realtime-stt] Non-JSON text message: {}", text);
                        continue;
                    };

                    let evt_type = event.get("type").and_then(|v| v.as_str()).unwrap_or("");

                    match evt_type {
                        "session.created" | "transcription_session.created" => {
                            debug!("[phosai-realtime-stt] Session created, sending config");
                            let update = json!({
                                "type": "session.update",
                                "session": {
                                    "input_audio_format": "pcm16",
                                    "input_audio_transcription": {
                                        "model": model,
                                        "language": language
                                    },
                                    "turn_detection": null
                                }
                            });
                            let _ = reply_tx.send(Message::Text(update.to_string().into()));
                        }

                        "session.updated" | "transcription_session.updated" => {
                            debug!("[phosai-realtime-stt] Session configured and ready");
                        }

                        // Streaming partial hypothesis / delta
                        "conversation.item.input_audio_transcription.delta"
                        | "response.audio_transcript.delta"
                        | "realtime" => {
                            let delta = event
                                .get("delta")
                                .or_else(|| event.get("text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            if !delta.is_empty() {
                                if !sent_first_text {
                                    sent_first_text = true;
                                    let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                }
                                let _ = result_tx.send(SttEvent::PartialTranscript(delta)).await;
                            }
                        }

                        // Final speech transcription for committed segment
                        "conversation.item.input_audio_transcription.completed"
                        | "response.audio_transcript.done"
                        | "transcription.completed"
                        | "fullSentence" => {
                            let transcript = event
                                .get("transcript")
                                .or_else(|| event.get("text"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string();

                            info!("[phosai-realtime-stt] Final Transcript: {:?}", transcript);
                            if !transcript.is_empty() {
                                if !sent_first_text {
                                    let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                }
                                sent_first_text = false;
                                let _ = result_tx.send(SttEvent::Transcript(transcript)).await;
                            }
                        }

                        "input_audio_buffer.speech_started" => {
                            debug!("[phosai-realtime-stt] Remote VAD: speech started");
                        }

                        "input_audio_buffer.speech_stopped" => {
                            debug!("[phosai-realtime-stt] Remote VAD: speech stopped");
                        }

                        "error" | "conversation.item.input_audio_transcription.failed" => {
                            warn!("[phosai-realtime-stt] Server error event: {}", text);
                        }

                        _ => {}
                    }
                }
            }

            let disconnect_reason = match status_rx.borrow().clone() {
                WsStatus::Disconnected { reason } => Some(reason),
                _ => None,
            };
            if let Some(reason) = disconnect_reason {
                let _ = result_tx
                    .send(SttEvent::Error(format!(
                        "PhosAI Realtime STT disconnected: {}",
                        reason
                    )))
                    .await;
            }
        });

        info!(
            "[phosai-realtime-stt] Ready (url={}, model={}, lang={})",
            ws_url, self.model, self.language
        );
        Ok(())
    }

    /// Feed audio directly into the streaming WebSocket channel.
    fn feed_audio(&self, audio: &[u8]) {
        if audio.is_empty() {
            return;
        }
        if let Some(tx) = &self.audio_tx {
            let _ = tx.send(audio.to_vec());
        }
    }

    /// Commit the audio buffer so the server finalizes and transcribes immediately.
    fn finalize(&self) {
        let Some(tx) = &self.conn_msg_tx else { return };
        let msg = r#"{"type":"input_audio_buffer.commit"}"#;
        let _ = tx.send(Message::Text(msg.to_string().into()));
    }

    fn close(&self) {
        // Dropping senders closes the connection cleanly
    }

    fn take_result_rx(&mut self) -> Option<mpsc::Receiver<SttEvent>> {
        self.result_rx.take()
    }
}
