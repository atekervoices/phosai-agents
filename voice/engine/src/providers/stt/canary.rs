//! Canary STT provider — segmented HTTP speech-to-text using NVIDIA NeMo Canary / Parakeet.
//!
//! # How it works
//!
//! 1. `feed_audio()` accumulates 16 kHz PCM-16 LE audio frames in an internal buffer.
//! 2. `finalize()` drains the buffer and POSTs raw PCM bytes to
//!    `<base_url>/v1/transcribe/canary` (or `/transcribe`) with header `Content-Type: application/octet-stream`
//!    and query param `sample_rate=16000`.
//! 3. The transcript JSON `{"text": "..."}` is parsed and dispatched over `result_rx`.

use async_trait::async_trait;
use reqwest::Client;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tracing::{info, warn};

use crate::types::SttEvent;
use super::SttProvider;

pub struct CanarySttProvider {
    base_url: String,
    language: String,
    client: Client,
    pcm_buffer: Arc<Mutex<Vec<u8>>>,
    result_tx: Option<mpsc::Sender<SttEvent>>,
    result_rx: Option<mpsc::Receiver<SttEvent>>,
}

impl CanarySttProvider {
    pub fn new(base_url: &str, language: &str) -> Self {
        let base = if base_url.is_empty() {
            "https://canary.atekervoices.com"
        } else {
            base_url.trim_end_matches('/')
        };

        Self {
            base_url: base.to_string(),
            language: language.to_string(),
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("reqwest Client for Canary STT"),
            pcm_buffer: Arc::new(Mutex::new(Vec::new())),
            result_tx: None,
            result_rx: None,
        }
    }

    fn endpoint_url(&self) -> String {
        if self.base_url.ends_with("/v1/transcribe/canary") || self.base_url.ends_with("/transcribe") {
            self.base_url.clone()
        } else if self.base_url.ends_with("/v1") {
            format!("{}/transcribe/canary", self.base_url)
        } else {
            format!("{}/v1/transcribe/canary", self.base_url)
        }
    }
}

#[async_trait]
impl SttProvider for CanarySttProvider {
    fn provider_name(&self) -> &str {
        "canary"
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let (tx, rx) = mpsc::channel::<SttEvent>(16);
        self.result_tx = Some(tx);
        self.result_rx = Some(rx);
        info!("[canary-stt] Ready (url={}, lang={})", self.base_url, self.language);
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

        // Discard audio segments shorter than 350ms (11,200 bytes at 16kHz Int16 PCM) as noise blips
        if pcm.len() < 11_200 {
            if let Some(tx) = &self.result_tx {
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    let _ = tx_clone.send(SttEvent::Transcript("".into())).await;
                });
            }
            return;
        }

        let url = self.endpoint_url();
        let client = self.client.clone();
        let tx = match &self.result_tx {
            Some(t) => t.clone(),
            None => return,
        };
        let lang = self.language.clone();

        tokio::spawn(async move {
            let req = client
                .post(&url)
                .header("Content-Type", "application/octet-stream")
                .query(&[("sample_rate", "16000"), ("language", &lang)])
                .body(pcm);

            match req.send().await {
                Ok(resp) if resp.status().is_success() => {
                    match resp.json::<serde_json::Value>().await {
                        Ok(json) => {
                            let text = json.get("text")
                                .or_else(|| json.get("transcript"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim();

                            let lower = text.to_lowercase();
                            let clean_text = if lower.contains("subtitles by")
                                || lower.contains("amara.org")
                                || lower.contains("community subtitles")
                                || lower.contains("thank you for watching")
                                || lower.contains("subscribe to my channel")
                                || lower == "."
                                || lower == "-"
                            {
                                info!("[canary-stt] Suppressed hallucination: \"{text}\"");
                                ""
                            } else {
                                text
                            };

                            info!("[canary-stt] Transcript: \"{clean_text}\"");
                            let _ = tx.send(SttEvent::Transcript(clean_text.to_string())).await;
                        }
                        Err(err) => {
                            warn!("[canary-stt] Failed to parse JSON response: {err}");
                            let _ = tx.send(SttEvent::Transcript("".into())).await;
                        }
                    }
                }
                Ok(resp) => {
                    warn!("[canary-stt] HTTP error: {}", resp.status());
                    let _ = tx.send(SttEvent::Transcript("".into())).await;
                }
                Err(err) => {
                    warn!("[canary-stt] Request failed: {err}");
                    let _ = tx.send(SttEvent::Transcript("".into())).await;
                }
            }
        });
    }

    fn close(&self) {
        if let Ok(mut buf) = self.pcm_buffer.lock() {
            buf.clear();
        }
    }

    fn take_result_rx(&mut self) -> Option<mpsc::Receiver<SttEvent>> {
        self.result_rx.take()
    }
}
