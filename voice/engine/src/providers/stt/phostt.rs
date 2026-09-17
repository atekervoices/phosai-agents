//! PhoSTT STT provider — segmented HTTP transcription powered by Sunbird / African Whisper Large-v3.
//!
//! # Architecture & Protocol
//!
//! Similar to OpenAI Whisper and Groq:
//! 1. `feed_audio()` buffers raw PCM-16 LE audio in memory.
//! 2. `finalize()` wraps buffered PCM in a standard WAV container and POSTs
//!    a multipart form to `https://whisper-stt.atekervoices.com/v1/audio/transcriptions`.
//! 3. Returns the transcription text on the `result_rx` channel as `SttEvent::Transcript`.
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
//! Ref: <https://whisper-stt.atekervoices.com>

use async_trait::async_trait;
use secrecy::{ExposeSecret, SecretString};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::types::SttEvent;

use super::SttProvider;
use crate::utils::pcm_to_wav;

/// Normalizes language input to standard 3-letter / supported code for African Whisper models.
pub fn normalize_phostt_language(lang: &str) -> String {
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

/// Resolves the transcription endpoint URL from base_url or environment variables.
fn resolve_phostt_url(base_url: &str) -> String {
    let resolved = if !base_url.is_empty()
        && !base_url.contains("control.atekervoices.com")
        && !base_url.contains("stt-control")
        && !base_url.starts_with("ws://")
        && !base_url.starts_with("wss://")
    {
        base_url.to_string()
    } else {
        std::env::var("PHOSAI_STT_URL")
            .or_else(|_| std::env::var("PHOSTT_URL"))
            .or_else(|_| std::env::var("VOICEBOX_STT_URL"))
            .or_else(|_| std::env::var("NEXVOX_STT_URL"))
            .unwrap_or_else(|_| "https://whisper-stt.atekervoices.com".to_string())
    };

    let cleaned = if resolved.starts_with("ws://") {
        format!("http://{}", resolved.trim_start_matches("ws://"))
    } else if resolved.starts_with("wss://") {
        format!("https://{}", resolved.trim_start_matches("wss://"))
    } else {
        resolved
    };

    let trimmed = cleaned.trim_end_matches('/');
    if trimmed.ends_with("/audio/transcriptions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/audio/transcriptions")
    } else {
        format!("{trimmed}/v1/audio/transcriptions")
    }
}

/// Resolves the STT API key from config or environment variables.
fn resolve_phostt_api_key(api_key: &str) -> SecretString {
    let resolved = if !api_key.is_empty() && api_key != "none" {
        api_key.to_string()
    } else {
        std::env::var("PHOSTT_API_KEY")
            .or_else(|_| std::env::var("VOICEBOX_API_KEY"))
            .or_else(|_| std::env::var("NEXVOX_API_KEY"))
            .unwrap_or_else(|_| "none".to_string())
    };
    SecretString::from(resolved)
}

/// Segmented STT via PhoSTT / Sunbird Whisper Large-v3 OpenAI-compatible API.
pub struct PhosttSttProvider {
    api_key: SecretString,
    model: String,
    language: String,
    endpoint_url: String,
    client: reqwest::Client,
    pcm_buffer: Arc<Mutex<Vec<u8>>>,
    result_tx: Option<mpsc::Sender<SttEvent>>,
    result_rx: Option<mpsc::Receiver<SttEvent>>,
}

impl PhosttSttProvider {
    pub fn new(base_url: &str, api_key: &str, model: &str, language: &str) -> Self {
        let endpoint_url = resolve_phostt_url(base_url);
        let api_key = resolve_phostt_api_key(api_key);
        let model = if model.is_empty() {
            "phosai-stt-v1".to_string()
        } else {
            model.to_string()
        };
        let language = normalize_phostt_language(language);

        Self {
            api_key,
            model,
            language,
            endpoint_url,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest Client for PhoSTT"),
            pcm_buffer: Arc::new(Mutex::new(Vec::new())),
            result_tx: None,
            result_rx: None,
        }
    }
}

#[async_trait]
impl SttProvider for PhosttSttProvider {
    fn provider_name(&self) -> &str {
        "phosai-stt"
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let (tx, rx) = mpsc::channel::<SttEvent>(16);
        self.result_tx = Some(tx);
        self.result_rx = Some(rx);
        if let Ok(mut buf) = self.pcm_buffer.lock() {
            buf.clear();
        }
        info!(
            "[phosai-stt] Ready (url={}, model={}, lang={})",
            self.endpoint_url, self.model, self.language
        );
        Ok(())
    }

    fn feed_audio(&self, audio: &[u8]) {
        if let Ok(mut buf) = self.pcm_buffer.lock() {
            buf.extend_from_slice(audio);
        }
    }

    fn finalize(&self) {
        let pcm = {
            let mut buf = match self.pcm_buffer.lock() {
                Ok(b) => b,
                Err(_) => return,
            };
            std::mem::take(&mut *buf)
        };

        if pcm.is_empty() {
            // Unblock reactor immediately
            if let Some(tx) = &self.result_tx {
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    let _ = tx_clone.send(SttEvent::Transcript("".into())).await;
                });
            }
            return;
        }

        let wav = pcm_to_wav(&pcm);
        let tx = match &self.result_tx {
            Some(tx) => tx.clone(),
            None => {
                warn!("[phostt] finalize() called before connect() — transcript discarded");
                return;
            }
        };

        let client = self.client.clone();
        let api_key = self.api_key.expose_secret().to_string();
        let model = self.model.clone();
        let language = self.language.clone();
        let url = self.endpoint_url.clone();

        tokio::spawn(async move {
            let part = match reqwest::multipart::Part::bytes(wav)
                .file_name("audio.wav")
                .mime_str("audio/wav")
            {
                Ok(p) => p,
                Err(e) => {
                    warn!("[phostt] Failed to build multipart part: {}", e);
                    let _ = tx.send(SttEvent::Transcript("".into())).await;
                    return;
                }
            };

            let mut form = reqwest::multipart::Form::new()
                .part("file", part)
                .text("model", model)
                .text("response_format", "json");

            if !language.is_empty() {
                form = form.text("language", language);
            }

            let mut req = client.post(&url).multipart(form);
            if !api_key.is_empty() && api_key != "none" {
                req = req.bearer_auth(&api_key);
            }

            match req.send().await {
                Ok(resp) if resp.status().is_success() => {
                    match resp.json::<serde_json::Value>().await {
                        Ok(body) => {
                            let text = body
                                .get("text")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_string();

                            info!("[phostt] Transcript: {:?}", text);
                            if !text.is_empty() {
                                let _ = tx.send(SttEvent::FirstTextReceived).await;
                            }
                            let _ = tx.send(SttEvent::Transcript(text)).await;
                        }
                        Err(e) => {
                            warn!("[phostt] Failed to parse JSON response: {}", e);
                            let _ = tx.send(SttEvent::Transcript("".into())).await;
                        }
                    }
                }
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    warn!("[phostt] HTTP {} — {}", status, body);
                    let _ = tx.send(SttEvent::Transcript("".into())).await;
                }
                Err(e) => {
                    warn!("[phostt] HTTP request failed: {}", e);
                    let _ = tx.send(SttEvent::Transcript("".into())).await;
                }
            }
        });
    }

    fn close(&self) {
        if let Ok(mut buf) = self.pcm_buffer.lock() {
            if !buf.is_empty() {
                warn!(
                    "[phostt] close() called with {} buffered PCM bytes — audio discarded",
                    buf.len()
                );
            }
            buf.clear();
        }
    }

    fn take_result_rx(&mut self) -> Option<mpsc::Receiver<SttEvent>> {
        self.result_rx.take()
    }
}
