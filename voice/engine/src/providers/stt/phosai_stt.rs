//! PhosAI STT provider — real-time streaming speech recognition over dual WebSockets.
//!
//! # Architecture & Protocol
//!
//! PhosAI STT uses two WebSocket connections:
//! 1. **Control Socket** (`/control`): sends JSON parameters (language, silence, VAD sensitivity)
//!    and controls audio pipeline (`abort`, `clear_audio_queue`).
//! 2. **Data Socket** (`/data`): streams binary PCM-16 LE audio packets and receives
//!    real-time transcription events (`recording_start`, `realtime`, `recording_stop`, `fullSentence`).
//!
//! Binary frame layout sent over Data Socket:
//! `[4-byte metadata_len (u32 LE)] [JSON metadata: {"sampleRate":16000}] [PCM audio bytes]`

use async_trait::async_trait;
use reqwest::Client as HttpClient;
use secrecy::SecretString;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message};
use tracing::info;

use crate::providers::ws::{ManagedWsConnection, WsConfig, WsKeepalive, WsStatus};
use crate::types::SttEvent;

use super::SttProvider;

/// Map of language names to codes returned by `GET /languages`.
#[derive(Debug, Deserialize)]
struct LanguagesResponse {
    #[serde(default)]
    languages: HashMap<String, String>,
}

/// Incoming Data WebSocket server event types.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ServerDataEvent {
    #[serde(rename = "recording_start")]
    RecordingStart,
    #[serde(rename = "realtime")]
    Realtime {
        #[serde(default)]
        text: String,
    },
    #[serde(rename = "recording_stop")]
    RecordingStop,
    #[serde(rename = "fullSentence")]
    FullSentence {
        #[serde(default)]
        text: String,
    },
}

/// Derive control, data, and languages URLs from `base_url` or environment variables.
fn resolve_phosai_urls(base_url: &str) -> (String, String, String) {
    let env_control = std::env::var("PHOSAI_STT_CONTROL_URL")
        .ok()
        .filter(|s| !s.is_empty());
    let env_data = std::env::var("PHOSAI_STT_DATA_URL")
        .ok()
        .filter(|s| !s.is_empty());

    let (mut control_url, mut data_url) = if let (Some(c), Some(d)) = (env_control.clone(), env_data.clone())
    {
        (c, d)
    } else if !base_url.is_empty() {
        let ws_base = base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://");

        if ws_base.contains("/control") {
            let data = ws_base.replace("/control", "/data");
            (ws_base, data)
        } else if ws_base.contains("/data") {
            let control = ws_base.replace("/data", "/control");
            (control, ws_base)
        } else {
            let trimmed = ws_base.trim_end_matches('/');
            (format!("{}/control", trimmed), format!("{}/data", trimmed))
        }
    } else {
        (
            env_control.unwrap_or_else(|| "wss://stt-control.atekervoices.com/control".to_string()),
            env_data.unwrap_or_else(|| "wss://stt-data.atekervoices.com/data".to_string()),
        )
    };

    // For non-local domain names (e.g. *.atekervoices.com), enforce wss:// for WebSocket
    // and https:// for HTTP to satisfy Cloudflare SSL requirements and avoid HTTP 530 errors.
    let fix_ws_scheme = |url: String| -> String {
        if url.starts_with("ws://") {
            let host = url
                .strip_prefix("ws://")
                .unwrap_or(&url)
                .split('/')
                .next()
                .unwrap_or_default();
            if !host.contains("localhost")
                && !host.contains("127.0.0.1")
                && host.parse::<std::net::IpAddr>().is_err()
            {
                return url.replace("ws://", "wss://");
            }
        }
        url
    };

    control_url = fix_ws_scheme(control_url);
    data_url = fix_ws_scheme(data_url);

    // Derive HTTPS endpoint for /languages from control URL
    let languages_url = if control_url.starts_with("wss://") {
        let host = control_url
            .strip_prefix("wss://")
            .unwrap_or(&control_url)
            .split('/')
            .next()
            .unwrap_or_default();
        format!("https://{}/languages", host)
    } else if control_url.starts_with("ws://") {
        let host = control_url
            .strip_prefix("ws://")
            .unwrap_or(&control_url)
            .split('/')
            .next()
            .unwrap_or_default();
        format!("http://{}/languages", host)
    } else {
        "https://control.atekervoices.com/languages".to_string()
    };

    (control_url, data_url, languages_url)
}

/// Map language name or ISO code to PhosAI target language code.
fn map_language_code(input: &str, languages_map: &HashMap<String, String>) -> String {
    let lower = input.trim().to_lowercase();
    if lower.is_empty() {
        return "eng".to_string();
    }

    // Check direct code match in map values
    for code in languages_map.values() {
        if code.to_lowercase() == lower {
            return code.clone();
        }
    }

    // Check direct name match in map keys
    for (name, code) in languages_map {
        if name.to_lowercase() == lower {
            return code.clone();
        }
    }

    // Fallbacks for standard codes & names
    match lower.as_str() {
        "en" | "eng" | "english" => "eng".to_string(),
        "sw" | "swa" | "swahili" => "swa".to_string(),
        "ach" | "acholi" => "ach".to_string(),
        "lgg" | "lugbara" => "lgg".to_string(),
        "lug" | "luganda" => "lug".to_string(),
        "nyn" | "runyankole" => "nyn".to_string(),
        "teo" | "ateso" => "teo".to_string(),
        "xog" | "lusoga" => "xog".to_string(),
        "ttj" | "rutooro" => "ttj".to_string(),
        "kin" | "kinyarwanda" => "kin".to_string(),
        "myx" | "lumasaba" => "myx".to_string(),
        other => other.to_string(),
    }
}

/// Collapse consecutive repeated words and phrases in a transcript.
fn dedup_repeated_words(text: &str) -> String {
    if text.trim().is_empty() {
        return text.to_string();
    }

    let normalize = |s: &str| -> String {
        s.chars()
            .filter(|c| c.is_alphanumeric())
            .collect::<String>()
            .to_ascii_lowercase()
    };

    let words: Vec<&str> = text.split_whitespace().collect();
    let mut deduped: Vec<&str> = Vec::with_capacity(words.len());
    for w in &words {
        if let Some(last) = deduped.last() {
            if normalize(last) == normalize(w) {
                continue;
            }
        }
        deduped.push(w);
    }

    let n = deduped.len();
    if n >= 2 {
        for split in (1..=n / 2).rev() {
            if split * 2 > n {
                continue;
            }
            let first: String = deduped[..split].join(" ");
            let second: String = deduped[split..split * 2].join(" ");
            if normalize(&first) == normalize(&second) {
                let mut result_parts: Vec<String> = Vec::new();
                result_parts.push(first);
                let rest: String = deduped[split * 2..].join(" ");
                if !rest.is_empty() {
                    result_parts.push(rest);
                }
                return result_parts.join(" ");
            }
        }
    }

    deduped.join(" ")
}

/// Streaming STT via PhosAI's dual-WebSocket API (`/control` & `/data`).
pub struct PhosAiSttProvider {
    _api_key: SecretString,
    _model: String,
    language: String,
    control_url: String,
    data_url: String,
    languages_url: String,
    http_client: HttpClient,
    languages_map: Arc<Mutex<HashMap<String, String>>>,
    control_conn_tx: Option<mpsc::UnboundedSender<Message>>,
    data_conn_tx: Option<mpsc::UnboundedSender<Message>>,
    result_rx: Option<mpsc::Receiver<SttEvent>>,
    audio_buffer: Arc<Mutex<Vec<u8>>>,
}

impl PhosAiSttProvider {
    pub fn new(base_url: &str, api_key: &str, model: &str, language: &str) -> Self {
        let (control_url, data_url, languages_url) = resolve_phosai_urls(base_url);

        Self {
            _api_key: SecretString::from(if api_key.is_empty() {
                "none".to_string()
            } else {
                api_key.to_string()
            }),
            _model: if model.is_empty() {
                "phosai-realtime".to_string()
            } else {
                model.to_string()
            },
            language: if language.is_empty() {
                "eng".to_string()
            } else {
                language.to_string()
            },
            control_url,
            data_url,
            languages_url,
            http_client: HttpClient::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("reqwest Client for PhosAI STT"),
            languages_map: Arc::new(Mutex::new(HashMap::new())),
            control_conn_tx: None,
            data_conn_tx: None,
            result_rx: None,
            audio_buffer: Arc::new(Mutex::new(Vec::with_capacity(4096))),
        }
    }

    /// Dynamically update target language on the Control WebSocket.
    pub fn set_language(&mut self, language: &str) {
        let target_code = {
            let map = self.languages_map.lock().unwrap();
            map_language_code(language, &map)
        };
        self.language = target_code.clone();

        if let Some(tx) = &self.control_conn_tx {
            let cmd = serde_json::json!({
                "command": "set_parameter",
                "parameter": "language",
                "value": target_code
            })
            .to_string();
            let _ = tx.send(Message::Text(cmd.into()));
            info!("[phosai-stt] Sent updated language parameter: {}", target_code);
        }
    }
}

#[async_trait]
impl SttProvider for PhosAiSttProvider {
    fn provider_name(&self) -> &str {
        "phosai-stt"
    }

    async fn connect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Fetch supported languages from /languages endpoint if available
        if let Ok(resp) = self.http_client.get(&self.languages_url).send().await {
            if resp.status().is_success() {
                if let Ok(data) = resp.json::<LanguagesResponse>().await {
                    if !data.languages.is_empty() {
                        let count = data.languages.len();
                        if let Ok(mut map) = self.languages_map.lock() {
                            *map = data.languages;
                        }
                        info!(
                            "[phosai-stt] Fetched {} supported languages from {}",
                            count, self.languages_url
                        );
                    }
                }
            }
        }

        let target_lang = {
            let map = self.languages_map.lock().unwrap();
            map_language_code(&self.language, &map)
        };
        self.language = target_lang.clone();

        let control_url_clone = self.control_url.clone();
        let control_conn = ManagedWsConnection::connect(
            move || {
                let req = control_url_clone
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

        let data_url_clone = self.data_url.clone();
        let data_conn = ManagedWsConnection::connect(
            move || {
                let req = data_url_clone
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

        let ManagedWsConnection {
            msg_tx: control_msg_tx,
            incoming_rx: mut control_incoming_rx,
            ..
        } = control_conn;

        let ManagedWsConnection {
            msg_tx: data_msg_tx,
            incoming_rx: mut data_incoming_rx,
            status_rx: data_status_rx,
            ..
        } = data_conn;

        // Set initial language on control socket
        let lang_cmd = serde_json::json!({
            "command": "set_parameter",
            "parameter": "language",
            "value": target_lang
        })
        .to_string();
        let _ = control_msg_tx.send(Message::Text(lang_cmd.into()));

        // Set post-speech silence duration (default 0.60s)
        let silence_val = std::env::var("PHOSAI_SILENCE_DURATION")
            .ok()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.60);
        let silence_cmd = serde_json::json!({
            "command": "set_parameter",
            "parameter": "post_speech_silence_duration",
            "value": silence_val
        })
        .to_string();
        let _ = control_msg_tx.send(Message::Text(silence_cmd.into()));

        // Set VAD sensitivity (default 0.55 for balanced speech detection)
        let sens_val = std::env::var("PHOSAI_SILERO_SENSITIVITY")
            .ok()
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.55);
        let sens_cmd = serde_json::json!({
            "command": "set_parameter",
            "parameter": "silero_sensitivity",
            "value": sens_val
        })
        .to_string();
        let _ = control_msg_tx.send(Message::Text(sens_cmd.into()));

        let (result_tx, result_rx) = mpsc::channel::<SttEvent>(32);
        self.control_conn_tx = Some(control_msg_tx);
        self.data_conn_tx = Some(data_msg_tx);
        self.result_rx = Some(result_rx);

        // Control socket log reader task
        tokio::spawn(async move {
            while let Some(msg) = control_incoming_rx.recv().await {
                if let Message::Text(text) = msg {
                    tracing::debug!("[phosai-stt] Control response: {}", text);
                }
            }
        });

        // Data socket message reader task
        tokio::spawn(async move {
            let mut sent_first_text = false;
            let mut sent_transcript_for_turn = false;
            let mut last_transcript = String::new();

            while let Some(msg) = data_incoming_rx.recv().await {
                if let Message::Text(text) = msg {
                    match serde_json::from_str::<ServerDataEvent>(&text) {
                        Ok(ServerDataEvent::RecordingStart) => {
                            info!("[phosai-stt] VAD speech start detected");
                            last_transcript.clear();
                            sent_transcript_for_turn = false;
                        }
                        Ok(ServerDataEvent::Realtime { text }) => {
                            let raw = text.trim();
                            if !raw.is_empty() {
                                let cleaned = dedup_repeated_words(raw);
                                if !sent_first_text && !cleaned.is_empty() {
                                    sent_first_text = true;
                                    let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                }
                                if !cleaned.is_empty() {
                                    info!("[phosai-stt] Realtime hypothesis: {:?}", cleaned);
                                    last_transcript = cleaned.clone();
                                    let _ = result_tx
                                        .send(SttEvent::PartialTranscript(cleaned))
                                        .await;
                                }
                            }
                        }
                        Ok(ServerDataEvent::RecordingStop) => {
                            info!("[phosai-stt] VAD speech stop detected");
                            if !sent_transcript_for_turn {
                                let cleaned = dedup_repeated_words(last_transcript.trim());
                                if !cleaned.is_empty() {
                                    if !sent_first_text {
                                        let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                    }
                                    sent_first_text = false;
                                    sent_transcript_for_turn = true;
                                    let _ = result_tx.send(SttEvent::Transcript(cleaned)).await;
                                    last_transcript.clear();
                                }
                            }
                        }
                        Ok(ServerDataEvent::FullSentence { text }) => {
                            let raw = text.trim();
                            let cleaned = dedup_repeated_words(raw);
                            info!("[phosai-stt] Full sentence: {:?}", cleaned);
                            if !cleaned.is_empty() {
                                last_transcript = cleaned.clone();
                                if !sent_transcript_for_turn {
                                    if !sent_first_text {
                                        let _ = result_tx.send(SttEvent::FirstTextReceived).await;
                                    }
                                    sent_first_text = false;
                                    sent_transcript_for_turn = true;
                                    let _ = result_tx.send(SttEvent::Transcript(cleaned)).await;
                                    last_transcript.clear();
                                }
                            }
                        }
                        Err(e) => {
                            info!("[phosai-stt] Data WS msg parse failed for '{}': {}", text, e);
                        }
                    }
                }
            }

            let disconnect_reason = match data_status_rx.borrow().clone() {
                WsStatus::Disconnected { reason } => Some(reason),
                _ => None,
            };
            if let Some(reason) = disconnect_reason {
                let _ = result_tx
                    .send(SttEvent::Error(format!(
                        "phosai data WS disconnected: {}",
                        reason
                    )))
                    .await;
            }
        });

        info!(
            "[phosai-stt] Connected (control={}, data={}, lang={})",
            self.control_url, self.data_url, self.language
        );
        Ok(())
    }

    fn feed_audio(&self, audio: &[u8]) {
        if audio.is_empty() {
            return;
        }

        if let Some(tx) = &self.data_conn_tx {
            let metadata_json = b"{\"sampleRate\":16000}";
            let metadata_len = metadata_json.len() as u32;

            let mut packet = Vec::with_capacity(4 + metadata_json.len() + audio.len());
            packet.extend_from_slice(&metadata_len.to_le_bytes());
            packet.extend_from_slice(metadata_json);
            packet.extend_from_slice(audio);

            let _ = tx.send(Message::Binary(packet.into()));
        }
    }

    fn finalize(&self) {
        // Real-time server uses server-side VAD; no explicit finalize frame required
    }

    fn close(&self) {
        if let Some(tx) = &self.control_conn_tx {
            let cmd = serde_json::json!({
                "command": "call_method",
                "method": "clear_audio_queue"
            })
            .to_string();
            let _ = tx.send(Message::Text(cmd.into()));
        }
    }

    fn take_result_rx(&mut self) -> Option<mpsc::Receiver<SttEvent>> {
        self.result_rx.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dedup_repeated_words() {
        assert_eq!(dedup_repeated_words("you you you"), "you");
        assert_eq!(
            dedup_repeated_words("You are welcome.. You are welcome. Okay, is so."),
            "You are welcome.. Okay, is so."
        );
    }

    #[test]
    fn test_resolve_urls() {
        let (c, d, l) = resolve_phosai_urls("ws://control.atekervoices.com/control");
        assert_eq!(c, "ws://control.atekervoices.com/control");
        assert_eq!(d, "ws://control.atekervoices.com/data");
        assert_eq!(l, "http://control.atekervoices.com/languages");
    }

    #[test]
    fn test_map_language_code() {
        let mut map = HashMap::new();
        map.insert("English".to_string(), "eng".to_string());
        map.insert("Swahili".to_string(), "swa".to_string());

        assert_eq!(map_language_code("en", &map), "eng");
        assert_eq!(map_language_code("Swahili", &map), "swa");
        assert_eq!(map_language_code("swa", &map), "swa");
    }
}
