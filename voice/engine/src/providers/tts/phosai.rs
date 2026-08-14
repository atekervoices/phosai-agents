//! Phosai HTTP TTS provider — single request per sentence HTTP synthesis.

use async_trait::async_trait;
use reqwest::Client;
use tracing::warn;

use super::TtsProvider;
use super::builtin::parse_wav;

pub struct PhosaiTtsProvider {
    client: Client,
    base_url: String,
    output_sample_rate: u32,
    default_voice: String,
    resampler: Option<soxr::SoxrStreamResampler>,
}

impl PhosaiTtsProvider {
    pub fn new(base_url: &str, output_sample_rate: u32, default_voice: &str) -> Self {
        let base = if base_url.is_empty() {
            "http://localhost:8200"
        } else {
            base_url.trim_end_matches('/')
        };

        let voice = if !default_voice.is_empty() && default_voice != "default" {
            default_voice.to_string()
        } else {
            "pcm_female_1".to_string()
        };

        Self {
            client: Client::new(),
            base_url: base.to_string(),
            output_sample_rate,
            default_voice: voice,
            resampler: None,
        }
    }

    fn endpoint_url(&self) -> String {
        let raw = self.base_url.trim_end_matches('/');
        let base = if !raw.starts_with("http://") && !raw.starts_with("https://") {
            format!("https://{}", raw)
        } else {
            raw.to_string()
        };
        if base.ends_with("/v1/audio/speech/stream") || base.ends_with("/v1/tts") {
            base
        } else if base.ends_with("/v1") {
            format!("{}/audio/speech/stream", base)
        } else {
            format!("{}/v1/audio/speech/stream", base)
        }
    }
}

#[async_trait]
impl TtsProvider for PhosaiTtsProvider {
    fn provider_name(&self) -> &str {
        "phosai"
    }

    async fn synthesize_chunk(&mut self, text: &str, voice_id: &str) -> Option<Vec<u8>> {
        let voice = if voice_id.is_empty() || voice_id == "default" {
            self.default_voice.as_str()
        } else {
            voice_id
        };

        let payload = serde_json::json!({
            "input": text,
            "voice": voice,
            "temperature": 0.1
        });

        let url = self.endpoint_url();
        let response = self.client.post(&url).json(&payload).send().await.ok()?;

        if !response.status().is_success() {
            warn!("[phosai-tts-http] HTTP error status {}", response.status());
            return None;
        }

        let raw = response.bytes().await.ok()?.to_vec();
        if raw.is_empty() {
            return None;
        }

        // Decode WAV header or treat as 16kHz PCM
        let (pcm_bytes, native_rate) = if let Some(decoded) = parse_wav(&raw) {
            (decoded.pcm, decoded.sample_rate)
        } else {
            (raw, 16_000)
        };

        if native_rate != self.output_sample_rate {
            let resampler = self.resampler.get_or_insert_with(|| {
                soxr::SoxrStreamResampler::new(native_rate, self.output_sample_rate)
                    .expect("Failed to create SoxrStreamResampler for Phosai TTS")
            });
            Some(resampler.process(&pcm_bytes))
        } else {
            Some(pcm_bytes)
        }
    }
}
