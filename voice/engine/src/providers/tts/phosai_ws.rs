//! Phosai WebSocket TTS provider — real-time streaming speech synthesis.
//!
//! # Protocol
//!
//! Connection: `ws://` or `wss://` to `<base_url>/v1/audio/speech/stream/ws`
//! Sent messages (JSON):
//!   - `{"input": "text", "voice": "pcm_female_1", "continue": true, "segment_id": "<context_id>", "temperature": 0.1}`
//!   - Flush: `{"input": "", "voice": "pcm_female_1", "continue": false, "segment_id": "<context_id>", "temperature": 0.1}`
//! Received messages:
//!   - Binary WS message -> raw 16 kHz PCM-16 LE audio
//!   - JSON message `{"type": "end"}` or `{"type": "finish"}` -> completion marker (`is_final = true`)

use async_trait::async_trait;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
use tracing::{info, warn};

use super::{TtsAudioChunk, TtsStreamingProvider};
use crate::providers::ws::{ManagedWsConnection, WsConfig, WsKeepalive};

/// Native sample rate for Phosai TTS.
const PHOSAI_WS_SAMPLE_RATE: u32 = 16_000;

/// All supported Phosai TTS voices grouped by language.
pub static PHOSAI_VOICES: &[&str] = &[
    // English
    "eng_female_1", "eng_male_1",
    // Acholi
    "ach_female_2", "ach_female_6", "ach_female_7", "ach_female_8", "ach_female_9",
    "ach_male_1", "ach_male_3", "ach_male_4", "ach_male_5", "ach_male_10",
    // Ateso
    "teo_female_1", "teo_male_1",
    // Runyankore
    "nyn_female_1", "nyn_female_2", "nyn_female_4", "nyn_female_5", "nyn_female_10",
    "nyn_male_3", "nyn_male_6", "nyn_male_7", "nyn_male_8", "nyn_male_9",
    // Swahili
    "swa_female_1", "swa_female_2", "swa_female_5", "swa_female_6",
    "swa_male_3", "swa_male_4", "swa_male_8",
    // Luganda
    "lug_female_4", "lug_female_5", "lug_female_7", "lug_female_8", "lug_female_10",
    "lug_male_1", "lug_male_2", "lug_male_3", "lug_male_6", "lug_male_9",
    // Lusoga
    "xog_female_1", "xog_male_1",
    // Kinyarwanda
    "kin_female_1",
    // Luo
    "luo_female_1", "luo_female_2", "luo_female_3", "luo_female_4",
    "luo_male_1", "luo_male_2", "luo_male_3", "luo_male_4",
    // Kikuyu
    "kik_female_2", "kik_female_3", "kik_male_1", "kik_male_4",
    // Hausa
    "hau_female_1", "hau_female_3", "hau_female_5", "hau_female_7",
    "hau_male_2", "hau_male_4", "hau_male_6", "hau_male_8",
    // Igbo
    "ibo_female_1", "ibo_female_3", "ibo_female_5", "ibo_female_7",
    "ibo_male_2", "ibo_male_4", "ibo_male_6", "ibo_male_8",
    // Twi
    "twi_female_2", "twi_female_4", "twi_male_1", "twi_male_3",
    // Yoruba
    "yor_female_1", "yor_female_3", "yor_female_5", "yor_female_7",
    "yor_male_2", "yor_male_4", "yor_male_6", "yor_male_8",
    // Wolof
    "wol_female_1", "wol_male_1",
    // Nigerian Pidgin
    "pcm_female_1", "pcm_female_2", "pcm_female_3", "pcm_female_4", "pcm_female_5",
    "pcm_male_1", "pcm_male_2", "pcm_male_3", "pcm_male_4", "pcm_male_5",
    // Fula
    "fat_female_2", "fat_female_4", "fat_male_1", "fat_male_3",
];

use std::sync::{Arc, Mutex};

#[derive(Default)]
struct PhosaiWsState {
    sentences_sent: usize,
    segments_received: usize,
    llm_text_finished: bool,
    active_context_id: String,
}

pub struct PhosaiWsTtsProvider {
    base_url: String,
    voice_id: String,
    temperature: f32,
    output_sample_rate: u32,
    conn_msg_tx: Option<mpsc::UnboundedSender<Message>>,
    audio_tx: Option<mpsc::Sender<TtsAudioChunk>>,
    audio_rx: Option<mpsc::Receiver<TtsAudioChunk>>,
    last_pending_text: Option<(String, String)>,

    state: Arc<Mutex<PhosaiWsState>>,
    reader_handle: Option<tokio::task::JoinHandle<()>>,
}

impl PhosaiWsTtsProvider {
    pub fn new(base_url: &str, output_sample_rate: u32, default_voice: &str) -> Self {
        let base = if base_url.is_empty() || base_url.contains("localhost") || base_url.contains("127.0.0.1") {
            "https://tts.atekervoices.com"
        } else {
            base_url.trim_end_matches('/')
        };

        let voice = if !default_voice.is_empty() && default_voice != "default" {
            default_voice.to_string()
        } else {
            "pcm_female_1".to_string()
        };

        Self {
            base_url: base.to_string(),
            voice_id: voice,
            temperature: 0.1,
            output_sample_rate,
            conn_msg_tx: None,
            audio_tx: None,
            audio_rx: None,
            last_pending_text: None,

            state: Arc::new(Mutex::new(PhosaiWsState::default())),
            reader_handle: None,
        }
    }

    fn ws_url(&self) -> String {
        let raw = self.base_url.trim_end_matches('/');
        let base = if !raw.starts_with("ws://")
            && !raw.starts_with("wss://")
            && !raw.starts_with("http://")
            && !raw.starts_with("https://")
        {
            format!("wss://{}", raw)
        } else {
            raw.to_string()
        };
        let ws_base = base
            .replace("http://", "ws://")
            .replace("https://", "wss://");

        if ws_base.ends_with("/v1/audio/speech/stream/ws") {
            ws_base
        } else if ws_base.ends_with("/v1") {
            format!("{}/audio/speech/stream/ws", ws_base)
        } else {
            format!("{}/v1/audio/speech/stream/ws", ws_base)
        }
    }

    pub(crate) async fn reconnect_ws(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Abort old reader task and close old WS sender if re-connecting
        if let Some(handle) = self.reader_handle.take() {
            handle.abort();
        }
        if let Some(tx) = self.conn_msg_tx.take() {
            let _ = tx.send(Message::Close(None));
        }

        let url_str = self.ws_url();
        let output_sample_rate = self.output_sample_rate;
        let audio_tx = match &self.audio_tx {
            Some(tx) => tx.clone(),
            None => return Ok(()),
        };
        let state_clone = Arc::clone(&self.state);

        let url_for_closure = url_str.clone();
        let conn = ManagedWsConnection::connect(
            move || {
                let req = url_for_closure
                    .clone()
                    .into_client_request()
                    .map_err(|e| -> Box<dyn std::error::Error + Send + Sync> { Box::new(e) })?;
                Ok(req)
            },
            WsConfig {
                keepalive: WsKeepalive::WsPing {
                    interval: std::time::Duration::from_secs(15),
                },
                max_reconnect_attempts: 3,
                reconnect_delay: std::time::Duration::from_secs(1),
                max_total_reconnect_rounds: 5,
            },
        )
        .await
        .map_err(|e| -> Box<dyn std::error::Error> { e })?;

        let mut incoming_rx = conn.incoming_rx;

        // Reader task for Phosai TTS WebSocket audio & control messages
        let handle = tokio::spawn(async move {
            let mut resampler = if PHOSAI_WS_SAMPLE_RATE != output_sample_rate {
                soxr::SoxrStreamResampler::new(PHOSAI_WS_SAMPLE_RATE, output_sample_rate).ok()
            } else {
                None
            };

            while let Some(msg) = incoming_rx.recv().await {
                match msg {
                    Message::Binary(pcm_bytes) => {
                        if pcm_bytes.is_empty() {
                            continue;
                        }

                        let pcm = if let Some(ref mut r) = resampler {
                            r.process(&pcm_bytes)
                        } else {
                            pcm_bytes.to_vec()
                        };

                        let active_ctx = state_clone
                            .lock()
                            .ok()
                            .map(|s| s.active_context_id.clone())
                            .unwrap_or_default();

                        let chunk = TtsAudioChunk {
                            pcm,
                            is_final: false,
                            context_id: active_ctx,
                        };

                        if audio_tx.send(chunk).await.is_err() {
                            break;
                        }
                    }
                    Message::Text(text) => {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                            let msg_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

                            if msg_type == "end" {
                                let maybe_chunk = {
                                    let mut s = state_clone.lock().unwrap();
                                    s.segments_received += 1;
                                    info!(
                                        "[phosai-tts-ws] Server fragment segment {}/{} complete for ctx={}",
                                        s.segments_received, s.sentences_sent, s.active_context_id
                                    );

                                    if s.llm_text_finished && s.segments_received >= s.sentences_sent {
                                        info!(
                                            "[phosai-tts-ws] Received all {}/{} fragments for ctx={}, completing stream processing.",
                                            s.segments_received, s.sentences_sent, s.active_context_id
                                        );
                                        let c = TtsAudioChunk {
                                            pcm: vec![],
                                            is_final: true,
                                            context_id: s.active_context_id.clone(),
                                        };
                                        s.sentences_sent = 0;
                                        s.segments_received = 0;
                                        s.llm_text_finished = false;
                                        Some(c)
                                    } else {
                                        None
                                    }
                                };

                                if let Some(chunk) = maybe_chunk {
                                    let _ = audio_tx.send(chunk).await;
                                }
                            } else if msg_type == "finish" {
                                let chunk = {
                                    let mut s = state_clone.lock().unwrap();
                                    info!(
                                        "[phosai-tts-ws] Server sent finish: {}/{} fragments complete for ctx={}",
                                        s.segments_received, s.sentences_sent, s.active_context_id
                                    );
                                    let c = TtsAudioChunk {
                                        pcm: vec![],
                                        is_final: true,
                                        context_id: s.active_context_id.clone(),
                                    };
                                    s.sentences_sent = 0;
                                    s.segments_received = 0;
                                    s.llm_text_finished = false;
                                    c
                                };
                                let _ = audio_tx.send(chunk).await;
                            } else if msg_type == "error" {
                                let err_msg = val.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error");
                                let maybe_chunk = {
                                    let mut s = state_clone.lock().unwrap();
                                    warn!(
                                        "[phosai-tts-ws] Server error for ctx={} (seg {}/{}): {}",
                                        s.active_context_id, s.segments_received + 1, s.sentences_sent, err_msg
                                    );
                                    s.segments_received += 1;

                                    if s.llm_text_finished && s.segments_received >= s.sentences_sent {
                                        info!(
                                            "[phosai-tts-ws] All segments accounted for after error ({}/{}), completing stream.",
                                            s.segments_received, s.sentences_sent
                                        );
                                        let c = TtsAudioChunk {
                                            pcm: vec![],
                                            is_final: true,
                                            context_id: s.active_context_id.clone(),
                                        };
                                        s.sentences_sent = 0;
                                        s.segments_received = 0;
                                        s.llm_text_finished = false;
                                        Some(c)
                                    } else {
                                        None
                                    }
                                };

                                if let Some(chunk) = maybe_chunk {
                                    let _ = audio_tx.send(chunk).await;
                                }
                            }
                        }
                    }
                    Message::Close(_) => {
                        info!("[phosai-tts-ws] Server closed WS");
                        break;
                    }
                    _ => {}
                }
            }
        });

        self.reader_handle = Some(handle);
        self.conn_msg_tx = Some(conn.msg_tx);
        Ok(())
    }
}

fn clean_tts_text(input: &str) -> String {
    let stripped: String = input
        .chars()
        .map(|c| match c {
            '*' | '#' | '_' | '~' | '`' | '>' | '◐' | '◑' | '◒' | '◓' | '●' | '◯' => ' ',
            other if other.is_control() => ' ',
            other => other,
        })
        .collect();
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[async_trait]
impl TtsStreamingProvider for PhosaiWsTtsProvider {
    fn provider_name(&self) -> &str {
        "phosai-ws"
    }

    fn set_voice(&mut self, voice_id: &str) {
        let v = voice_id.trim();
        if !v.is_empty() && v != "default" {
            info!("[phosai-tts-ws] Dynamically switching voice to: {}", v);
            self.voice_id = v.to_string();
        }
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let (audio_tx, audio_rx) = mpsc::channel::<TtsAudioChunk>(64);
        self.audio_tx = Some(audio_tx);
        self.audio_rx = Some(audio_rx);

        self.reconnect_ws().await?;
        info!("[phosai-tts-ws] Connected (url={})", self.ws_url());
        Ok(())
    }

    async fn send_text(&mut self, text: &str, context_id: &str, is_last: bool) {
        let cleaned = clean_tts_text(text);
        if cleaned.is_empty() {
            return;
        }

        // Fresh WS connection per turn — matching sparktts.py line 647:
        // ws = await self._tts._connect_ws(...)
        // Candle LLM retains generation state on the WS; a fresh connection
        // ensures a clean KV-cache for each turn.
        let needs_reconnect = if let Ok(mut s) = self.state.lock() {
            if !s.active_context_id.is_empty() && s.active_context_id != context_id {
                s.sentences_sent = 0;
                s.segments_received = 0;
                s.llm_text_finished = false;
                s.active_context_id = context_id.to_string();
                true
            } else {
                if s.active_context_id.is_empty() {
                    s.active_context_id = context_id.to_string();
                }
                false
            }
        } else {
            false
        };

        if needs_reconnect {
            info!("[phosai-tts-ws] Context changed — reconnecting WS for fresh Candle LLM state (ctx={})", context_id);
            let _ = self.reconnect_ws().await;
        }

        let voice_to_use = if self.voice_id.is_empty() || self.voice_id == "default" {
            "pcm_female_1"
        } else {
            self.voice_id.as_str()
        };

        static SEG_ID_GEN: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(1000);
        let short_seg_id = format!("{:08x}", SEG_ID_GEN.fetch_add(1, std::sync::atomic::Ordering::Relaxed));

        if let Ok(mut s) = self.state.lock() {
            s.sentences_sent += 1;
            let seg_idx = s.sentences_sent;

            if let Some(tx) = &self.conn_msg_tx {
                // Matching sparktts.py:
                //   streaming fragments → "continue": true  (line 523)
                //   final fragment      → "continue": false (line 479)
                let pkt = if is_last {
                    json!({
                        "input": cleaned,
                        "voice": voice_to_use,
                        "temperature": self.temperature,
                        "continue": false,
                        "segment_id": short_seg_id,
                    })
                } else {
                    json!({
                        "input": cleaned,
                        "voice": voice_to_use,
                        "temperature": self.temperature,
                        "continue": true,
                        "segment_id": short_seg_id,
                    })
                };
                info!("[phosai-tts-ws] Streaming fragment #{}: '{}' (continue={}, seg_id={})", seg_idx, cleaned, !is_last, short_seg_id);
                let _ = tx.send(Message::Text(pkt.to_string().into()));
            }
        }

        // Pacing delay (100ms) between sending text packets to allow Candle LLM server
        // enough time to setup generation state without socket collision
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }

    async fn flush(&mut self, context_id: &str) {
        let (maybe_chunk, audio_tx) = {
            if let Ok(mut s) = self.state.lock() {
                s.llm_text_finished = true;
                info!(
                    "[phosai-tts-ws] LLM text finished for ctx={}, total sent={}",
                    context_id, s.sentences_sent
                );

                let chunk = if s.sentences_sent == 0 || s.segments_received >= s.sentences_sent {
                    info!(
                        "[phosai-tts-ws] Completing stream immediately in flush (sent={}, received={})",
                        s.sentences_sent, s.segments_received
                    );
                    let c = TtsAudioChunk {
                        pcm: vec![],
                        is_final: true,
                        context_id: context_id.to_string(),
                    };
                    s.sentences_sent = 0;
                    s.segments_received = 0;
                    s.llm_text_finished = false;
                    Some(c)
                } else {
                    None
                };
                (chunk, self.audio_tx.clone())
            } else {
                (None, None)
            }
        };

        if let (Some(chunk), Some(tx)) = (maybe_chunk, audio_tx) {
            let _ = tx.send(chunk).await;
        }
    }

    async fn cancel(&mut self, context_id: &str) {
        self.last_pending_text = None;
        if let Some(tx) = &self.conn_msg_tx {
            let pkt = json!({
                "cancel": true,
                "segment_id": context_id,
            });
            let _ = tx.send(Message::Text(pkt.to_string().into()));
        }
    }

    async fn close(&mut self) {
        if let Some(tx) = self.conn_msg_tx.take() {
            let _ = tx.send(Message::Close(None));
        }
    }

    fn take_audio_rx(&mut self) -> Option<mpsc::Receiver<TtsAudioChunk>> {
        self.audio_rx.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_phosai_ws_audio_stream() {
        let mut provider = PhosaiWsTtsProvider::new("https://tts.atekervoices.com", 16000, "pcm_female_1");
        let conn_res = provider.connect("test_session").await;
        assert!(conn_res.is_ok(), "Failed to connect to Phosai WS TTS: {:?}", conn_res.err());

        let mut rx = provider.take_audio_rx().expect("audio_rx should be present");

        provider.send_text("Hello, this is a live audio test from the Rust voice engine.", "ctx1", true).await;
        provider.flush("ctx1").await;

        let mut total_bytes = 0;
        let timeout = tokio::time::sleep(std::time::Duration::from_secs(10));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                Some(chunk) = rx.recv() => {
                    total_bytes += chunk.pcm.len();
                    println!("[TEST] Received TTS audio chunk: {} bytes, is_final={}", chunk.pcm.len(), chunk.is_final);
                    if chunk.is_final || (total_bytes > 0 && chunk.is_final) {
                        break;
                    }
                }
                _ = &mut timeout => {
                    println!("[TEST] Timeout reached. Total bytes received: {}", total_bytes);
                    break;
                }
            }
        }

        println!("[TEST] Total PCM audio bytes received from Phos AI WS TTS: {}", total_bytes);
        assert!(total_bytes > 0, "No audio bytes received from Phos AI WS TTS!");
    }
}
