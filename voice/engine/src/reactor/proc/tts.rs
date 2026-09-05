//! TTS stage — drives a TtsProvider or TtsStreamingProvider with token batching.
//!
//! The Reactor feeds LLM tokens via `feed_token()`, calls `flush()` when the
//! LLM stream ends, and polls for audio chunks via `recv()` in its `select!`.
//!
//! # Modes
//!
//! **HTTP pull** (`TtsMode::Http`): identical to the previous behaviour — sentence
//! batching, one `synthesize_chunk()` call per batch, audio returned inline.
//!
//! **WS streaming** (`WsTtsHandle`): the Reactor holds a persistent WS connection
//! across turns.  Each turn the stage receives channel handles to send text and
//! receive audio.  Tokens are sent as they arrive (with sentence-boundary batching
//! for lower TTFS).  A fresh UUID `context_id` is minted per turn; `cancel()`
//! sends the barge-in signal for that context.
//!
//! Cancellation in both modes: drop `TtsStage` or call `cancel()`.

use bytes::Bytes;
use tokio::sync::{mpsc, oneshot};
use tracing::{info, warn};
use uuid::Uuid;

use crate::types::TtsEvent;

// ── Text chunking helpers ────────────────────────────────────
//
// Both the HTTP and WS paths accumulate tokens and flush at sentence
// boundaries for better synthesis quality.

/// Sentence-ending punctuation marks for complete sentence boundaries.
/// Commas (,), semicolons (;), and colons (:) are intentional parts of sentences and are NOT split on.
const PUNCT_MARKS: &[char] = &[
    '.', '!', '?', '\n',
    '\u{3002}', '\u{FF01}', '\u{FF1F}'
];

/// Extract next fragment:
/// 1. Finds earliest sentence terminator in `buffer`. Slices up to and including punctuation.
/// 2. If no sentence punctuation and `buffer` > 200 chars, finds last space (> 40 chars) and slices there.
fn extract_next_fragment(buffer: &mut String) -> Option<String> {
    let mut earliest_pos: Option<usize> = None;
    for (idx, ch) in buffer.char_indices() {
        if PUNCT_MARKS.contains(&ch) {
            earliest_pos = Some(idx);
            break;
        }
    }

    if let Some(pos) = earliest_pos {
        let ch_len = buffer[pos..].chars().next().map_or(1, |c| c.len_utf8());
        let split_idx = pos + ch_len;
        let raw_chunk = buffer[..split_idx].to_string();
        *buffer = buffer[split_idx..].trim_start().to_string();
        return Some(raw_chunk);
    }

    if buffer.chars().count() > 200 {
        if let Some(last_space) = buffer.rfind(' ') {
            if last_space > 40 {
                let raw_chunk = buffer[..last_space].to_string();
                *buffer = buffer[last_space..].trim_start().to_string();
                return Some(raw_chunk);
            }
        }
    }

    None
}

// ── WS handle for session-level connection reuse ─────────────

/// Lightweight handle to a session-level WS TTS connection.
///
/// Carries only the command sender — the Reactor feeds audio directly
/// into the active `TtsStage` from its own select! arm, so there is
/// no per-turn audio relay channel and no shared mutex needed.
pub struct WsTtsHandle {
    /// Sends `WsCmd` messages to the session-level WS send task.
    pub cmd_tx: mpsc::UnboundedSender<WsCmd>,
}

/// Commands sent from `TtsStage` to the session-level WS send task.
#[derive(Debug)]
pub enum WsCmd {
    /// Send text to the WS provider for a given context.
    /// `is_last` is true only for the final fragment of a turn.
    SendText { text: String, context_id: String, is_last: bool },
    /// Flush (end-of-turn) for the given context.
    Flush { context_id: String },
    /// Cancel (barge-in) for the given context.
    Cancel { context_id: String },
}

pub struct TtsStage {
    /// Sends tokens into the batching task.
    token_tx: Option<mpsc::UnboundedSender<Option<String>>>,
    /// Receives PCM audio events (and the Finished sentinel).
    audio_rx: Option<mpsc::Receiver<TtsEvent>>,
    /// Reactor writes WS audio events into this sender (WS mode only).
    audio_event_tx: Option<mpsc::Sender<TtsEvent>>,
    /// Sends commands to the persistent session-level WS send task (WS mode only).
    ws_cmd_tx: Option<mpsc::UnboundedSender<WsCmd>>,
    /// For WS-streaming mode: fires the barge-in cancel signal into the send task.
    cancel_tx: Option<oneshot::Sender<()>>,
    /// The context_id for the current WS turn (empty in HTTP mode).
    /// The reactor matches incoming chunks against this before calling push_ws_chunk().
    current_context_id: String,
}

impl TtsStage {
    pub fn new() -> Self {
        Self {
            token_tx: None,
            audio_rx: None,
            audio_event_tx: None,
            ws_cmd_tx: None,
            cancel_tx: None,
            current_context_id: String::new(),
        }
    }

    /// Begin a new synthesis session for this LLM turn.
    ///
    /// For HTTP mode, accepts a `TtsMode::Http` (built fresh per-turn).
    /// For WS mode, accepts a `WsTtsHandle` from the session-scoped connection.
    pub fn start_http(
        &mut self,
        provider: Box<dyn crate::providers::tts::TtsProvider>,
        voice_id: String,
    ) {
        // Cancel any previous session
        self.token_tx = None;
        self.audio_rx = None;
        self.cancel_tx = None;

        let (token_tx, mut token_rx) = mpsc::unbounded_channel::<Option<String>>();
        let (audio_tx, audio_rx) = mpsc::channel::<TtsEvent>(32);

        tokio::spawn(async move {
            let mut provider = provider;
            let mut buffer = String::new();
            let mut chunk_count = 0u32;

            loop {
                match token_rx.recv().await {
                    Some(None) | None => {
                        if !buffer.trim().is_empty() {
                            if let Some(pcm) =
                                provider.synthesize_chunk(buffer.trim(), &voice_id).await
                            {
                                let _ = audio_tx.send(TtsEvent::Audio(Bytes::from(pcm))).await;
                            }
                        }
                        let _ = audio_tx.send(TtsEvent::Finished).await;
                        break;
                    }
                    Some(Some(token)) => {
                        buffer.push_str(&token);

                        while let Some(fragment) = extract_next_fragment(&mut buffer) {
                            let to_send = fragment.trim().to_string();
                            if !to_send.is_empty() {
                                match provider.synthesize_chunk(&to_send, &voice_id).await {
                                    Some(pcm) => {
                                        chunk_count += 1;
                                        if audio_tx
                                            .send(TtsEvent::Audio(Bytes::from(pcm)))
                                            .await
                                            .is_err()
                                        {
                                            break;
                                        }
                                    }
                                    None => warn!(
                                        "[tts_stage] synthesize_chunk returned None: '{}'",
                                        to_send
                                    ),
                                }
                            }
                        }
                    }
                }
            }

            info!(
                "[tts_stage] HTTP batch task finished ({} chunks)",
                chunk_count
            );
        });

        self.token_tx = Some(token_tx);
        self.audio_rx = Some(audio_rx);
    }

    /// Begin a WS streaming synthesis session for this LLM turn.
    ///
    /// The Reactor feeds audio directly via `push_ws_chunk()` from its own
    /// select! arm — there is no relay task and no shared mutex.
    pub fn start_ws(&mut self, handle: WsTtsHandle) {
        // Cancel any previous session.
        self.token_tx = None;
        self.audio_rx = None;
        self.audio_event_tx = None;
        self.cancel_tx = None;

        let context_id = Uuid::new_v4().to_string();
        self.current_context_id = context_id.clone();
        let cmd_tx = handle.cmd_tx;
        self.ws_cmd_tx = Some(cmd_tx.clone());

        let (token_tx, mut token_rx) = mpsc::unbounded_channel::<Option<String>>();
        // The reactor feeds TtsEvents into this channel via push_ws_chunk().
        let (audio_event_tx, audio_rx) = mpsc::channel::<TtsEvent>(64);
        let finished_tx = audio_event_tx.clone();
        self.audio_event_tx = Some(audio_event_tx);
        self.audio_rx = Some(audio_rx);

        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        self.cancel_tx = Some(cancel_tx);

        // Spawn token-accumulation + send task.
        // Tokens are buffered and flushed at sentence/clause boundaries
        // for better synthesis quality (matching Python tts.py).
        let ctx = context_id.clone();
        let cmd_tx2 = cmd_tx;
        tokio::spawn(async move {
            let mut buffer = String::new();
            let mut chunk_count = 0u32;
            // Hold back the most recently extracted fragment so we can mark the
            // very last one with is_last=true when the stream ends.
            // Matching sparktts.py: "continue": true for streaming, "continue": false for final.
            let mut pending_fragment: Option<String> = None;

            loop {
                tokio::select! {
                    biased; // cancel_rx must always win over pending tokens on barge-in
                    _ = &mut cancel_rx => {
                        break;
                    }
                    msg = token_rx.recv() => match msg {
                        Some(None) | None => {
                            // Stream ended — drain remaining fragments from buffer.
                            while let Some(fragment) = extract_next_fragment(&mut buffer) {
                                let trimmed = fragment.trim().to_string();
                                if !trimmed.is_empty() {
                                    if let Some(prev) = pending_fragment.take() {
                                        let _ = cmd_tx2.send(WsCmd::SendText {
                                            text: prev,
                                            context_id: ctx.clone(),
                                            is_last: false,
                                        });
                                        chunk_count += 1;
                                    }
                                    pending_fragment = Some(trimmed);
                                }
                            }
                            // Leftover text in buffer
                            if !buffer.trim().is_empty() {
                                if let Some(prev) = pending_fragment.take() {
                                    let _ = cmd_tx2.send(WsCmd::SendText {
                                        text: prev,
                                        context_id: ctx.clone(),
                                        is_last: false,
                                    });
                                    chunk_count += 1;
                                }
                                pending_fragment = Some(buffer.trim().to_string());
                                buffer.clear();
                            }

                            // Send FINAL fragment with is_last=true → "continue": false
                            if let Some(last) = pending_fragment.take() {
                                let _ = cmd_tx2.send(WsCmd::SendText {
                                    text: last,
                                    context_id: ctx.clone(),
                                    is_last: true,
                                });
                                chunk_count += 1;
                            }

                            if chunk_count > 0 {
                                let _ = cmd_tx2.send(WsCmd::Flush { context_id: ctx.clone() });
                            } else {
                                let _ = finished_tx.send(TtsEvent::Finished).await;
                            }
                            break;
                        }
                        Some(Some(token)) => {
                            buffer.push_str(&token);

                            // Extract at punctuation boundaries (matching sparktts.py line 466:
                            // punct_marks = {'.', '!', '?', ',', ';', ':'})
                            while let Some(fragment) = extract_next_fragment(&mut buffer) {
                                let trimmed = fragment.trim().to_string();
                                if !trimmed.is_empty() {
                                    if let Some(prev) = pending_fragment.take() {
                                        let _ = cmd_tx2.send(WsCmd::SendText {
                                            text: prev,
                                            context_id: ctx.clone(),
                                            is_last: false,
                                        });
                                        chunk_count += 1;
                                    }
                                    pending_fragment = Some(trimmed);
                                }
                            }

                            // Long buffer fallback (> 200 chars)
                            if buffer.len() > 200 {
                                if let Some(last_space) = buffer.rfind(' ') {
                                    if last_space > 40 {
                                        let send_raw = buffer[..last_space].trim().to_string();
                                        buffer = buffer[last_space..].trim_start().to_string();
                                        if !send_raw.is_empty() {
                                            if let Some(prev) = pending_fragment.take() {
                                                let _ = cmd_tx2.send(WsCmd::SendText {
                                                    text: prev,
                                                    context_id: ctx.clone(),
                                                    is_last: false,
                                                });
                                                chunk_count += 1;
                                            }
                                            pending_fragment = Some(send_raw);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            info!(
                "[tts_stage] WS send task finished ({} batches sent)",
                chunk_count
            );
        });

        self.token_tx = Some(token_tx);
    }

    /// Returns `true` if the reactor should forward this `context_id` to `push_ws_chunk`.
    ///
    /// # Ordering invariant
    ///
    /// `start_ws()` sets `current_context_id` **synchronously** before spawning
    /// the batching task (and before any WS messages are sent).  The reactor's
    /// select! arm therefore always observes the correct ID by the time the
    /// first audio chunk arrives from the provider.  No external sync needed.
    pub fn accepts_context_id(&self, ctx: &str) -> bool {
        !self.current_context_id.is_empty() && ctx == self.current_context_id
    }

    /// Feed a WS audio chunk from the reactor's select! arm.
    ///
    /// The reactor calls this after `accepts_context_id()` returns true.
    /// Chunks for old/cancelled contexts are simply not forwarded.
    ///
    /// # Drop policy
    ///
    /// - **Audio frames**: dropped with `try_send` when the channel is full.
    ///   A dropped frame produces an audible gap but does not stall the reactor.
    /// - **`Finished` sentinel**: spawned as a separate task so the reactor's
    ///   select! arm is not blocked waiting for channel space.  The spawn is
    ///   guarded by `tx.is_closed()`: on a rapid barge-in sequence each
    ///   cancelled context still emits one `is_final` chunk, and without the
    ///   guard every one of those would spawn a task that immediately errors.
    ///   The guard short-circuits that: `cancel()` closes `audio_event_tx`,
    ///   so stale `is_final` chunks are discarded without a spawn.
    pub fn push_ws_chunk(&mut self, chunk: crate::providers::tts::TtsAudioChunk) {
        let Some(tx) = &self.audio_event_tx else {
            return;
        };

        if !chunk.pcm.is_empty()
            && tx
                .try_send(TtsEvent::Audio(bytes::Bytes::from(chunk.pcm)))
                .is_err()
        {
            warn!("[tts_stage] push_ws_chunk: audio event channel full — audio chunk dropped");
        }
        if chunk.is_final {
            // Guard before spawning: cancel() sets audio_event_tx = None, so
            // by the time we check `is_closed()` here the channel is already
            // closed for stale contexts.  No spawn needed — the turn is gone.
            if tx.is_closed() {
                return;
            }

            // Fast path: try to send the Finished sentinel synchronously.
            // This prevents unbounded task spawning during rapid barge-in cycles.
            if let Err(tokio::sync::mpsc::error::TrySendError::Full(_)) =
                tx.try_send(TtsEvent::Finished)
            {
                // If the channel is full, we must not drop the chunk (it would
                // stall the reactor), nor can we block. So we spawn a task to
                // wait for channel capacity.
                let tx = tx.clone();
                tokio::spawn(async move {
                    if tx.send(TtsEvent::Finished).await.is_err() {
                        warn!("[tts_stage] push_ws_chunk: Finished send failed — stage already closed");
                    }
                });
            }
        }
    }

    /// Feed a single LLM token to the batching task.
    pub fn feed_token(&self, token: &str) {
        if let Some(tx) = &self.token_tx {
            let _ = tx.send(Some(token.to_string()));
        }
    }

    /// Signal end-of-stream: flush remaining buffer and end synthesis.
    pub fn flush(&self) {
        if let Some(tx) = &self.token_tx {
            let _ = tx.send(None);
        }
    }

    /// Cancel immediately.  For WS providers, fires the barge-in signal into the send task.
    pub fn cancel(&mut self) {
        self.token_tx = None;
        self.audio_rx = None;
        self.audio_event_tx = None;

        // Take the context_id and send `Cancel` directly to guarantee delivery
        // even if the background token-batching task has already flushed and exited.
        let ctx = std::mem::take(&mut self.current_context_id);
        if let Some(cmd_tx) = self.ws_cmd_tx.take() {
            if !ctx.is_empty() {
                let _ = cmd_tx.send(WsCmd::Cancel { context_id: ctx });
            }
        }

        // Fire the oneshot so the token background task stops batching
        if let Some(tx) = self.cancel_tx.take() {
            let _ = tx.send(());
        }
    }

    /// Mark the TTS session as finished after receiving `TtsEvent::Finished`.
    ///
    /// This is a **state-only** transition: it makes `is_active()` return false
    /// so the reactor can transition to Listening.  It does NOT tear down audio
    /// channels — those are replaced by `start_ws()` / `start_http()` when the
    /// next turn begins, or torn down by `cancel()` on barge-in.
    pub fn mark_finished(&mut self) {
        self.token_tx = None;
        self.cancel_tx = None;
    }

    /// Poll for the next TTS event.
    pub async fn recv(&mut self) -> Option<TtsEvent> {
        self.audio_rx.as_mut()?.recv().await
    }

    /// True if a synthesis session is currently active.
    pub fn is_active(&self) -> bool {
        self.token_tx.is_some()
    }
}

impl Default for TtsStage {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_stage_is_inactive() {
        let stage = TtsStage::new();
        assert!(!stage.is_active());
    }

    #[test]
    fn mark_finished_clears_active_state() {
        let mut stage = TtsStage::new();
        let (tx, _rx) = mpsc::unbounded_channel::<Option<String>>();
        stage.token_tx = Some(tx);
        assert!(stage.is_active());
        stage.mark_finished();
        assert!(!stage.is_active());
    }

    // ── char_len ──────────────────────────────────────────────────

    #[test]
    fn char_len_ascii() {
        assert_eq!(char_len("hello"), 5);
    }

    #[test]
    fn char_len_cjk() {
        assert_eq!(char_len("你好吗"), 3);
        assert_eq!("你好吗".len(), 9); // 3 × 3 UTF-8 bytes each
    }

    #[test]
    fn char_len_mixed_latin_cjk() {
        // "Hi 你好" = 2 ASCII + 1 space + 2 CJK = 5 chars, 9 bytes
        assert_eq!(char_len("Hi 你好"), 5);
        assert_eq!("Hi 你好".len(), 9);
    }

    // ── should_flush ──────────────────────────────────────────────

    #[test]
    fn first_chunk_flushes_on_period() {
        assert!(should_flush("Hello world.", 0));
    }

    #[test]
    fn first_chunk_flushes_on_comma() {
        assert!(should_flush("Hello, ", 0));
    }

    #[test]
    fn first_chunk_flushes_on_length_overflow() {
        let text = "a".repeat(31);
        assert!(should_flush(&text, 0));
    }

    #[test]
    fn first_chunk_no_flush_short_buffer() {
        assert!(!should_flush("Hello", 0));
    }

    #[test]
    fn later_chunk_flushes_on_sentence_break() {
        assert!(should_flush("How are you?", 1));
    }

    #[test]
    fn later_chunk_no_flush_on_short_clause() {
        assert!(!should_flush("Hey, ", 1));
    }

    #[test]
    fn later_chunk_flushes_on_long_clause() {
        let text = format!("{},", "a".repeat(15));
        assert!(should_flush(&text, 1));
    }

    #[test]
    fn later_chunk_flushes_on_overflow() {
        let text = "a".repeat(201);
        assert!(should_flush(&text, 1));
    }

    #[test]
    fn cjk_does_not_trigger_premature_overflow() {
        // 20 CJK chars = 60 bytes, but char_len = 20 < 30, so no flush
        let text = "你".repeat(20);
        assert_eq!(text.len(), 60);
        assert_eq!(char_len(&text), 20);
        assert!(!should_flush(&text, 0));
    }

    #[test]
    fn cjk_flushes_on_cjk_full_stop() {
        // 。 is a SENTENCE_BREAK — should flush even on first chunk
        assert!(should_flush("你好。", 0));
    }

    #[test]
    fn cjk_no_flush_short_clause_later_chunks() {
        // 3-char CJK with fullwidth comma — too short for later-chunk clause flush (needs >15)
        assert!(!should_flush("你好，", 1));
    }

    #[test]
    fn cjk_flushes_long_clause_later_chunks() {
        // 16 CJK chars + fullwidth comma → char_len > 15 at chunk_count > 0
        let text = format!("{}，", "你".repeat(16));
        assert!(should_flush(&text, 1));
    }

    #[test]
    fn first_chunk_flushes_on_cjk_comma() {
        assert!(should_flush("你好，", 0));
    }

    #[test]
    fn first_chunk_flushes_on_cjk_question() {
        assert!(should_flush("你好吗？", 0));
    }

    #[test]
    fn trailing_whitespace_does_not_hide_punctuation() {
        // trim_end() should reveal the period → flush
        assert!(should_flush("Hello world.  ", 0));
    }

    #[test]
    fn whitespace_only_buffer_no_flush() {
        assert!(!should_flush("   ", 0));
    }

    #[test]
    fn later_chunk_no_flush_under_overflow() {
        // Exactly 200 chars, no punctuation → at threshold, not over → no flush
        let text = "a".repeat(200);
        assert!(!should_flush(&text, 1));
    }

    // ── split_at_best_break ───────────────────────────────────────

    #[test]
    fn split_at_sentence_break() {
        let (flush, rest) = split_at_best_break("Hello world. More text here");
        assert_eq!(flush, "Hello world.");
        assert_eq!(rest, " More text here");
    }

    #[test]
    fn split_at_clause_break_no_sentence() {
        let (flush, rest) = split_at_best_break("Hello world, more text here");
        assert_eq!(flush, "Hello world,");
        assert_eq!(rest, " more text here");
    }

    #[test]
    fn split_prefers_sentence_over_clause() {
        // Both a period and a comma present — should split at the period (rightmost sentence)
        let (flush, rest) = split_at_best_break("One, two. Three, four");
        assert_eq!(flush, "One, two.");
        assert_eq!(rest, " Three, four");
    }

    #[test]
    fn split_at_word_boundary_no_punctuation() {
        // No punctuation — falls back to last whitespace
        let (flush, rest) = split_at_best_break("hello world foo");
        assert_eq!(flush, "hello world ");
        assert_eq!(rest, "foo");
    }

    #[test]
    fn split_no_break_at_all() {
        let (flush, rest) = split_at_best_break("abcdefghij");
        assert_eq!(flush, "abcdefghij");
        assert_eq!(rest, "");
    }

    #[test]
    fn split_cjk_sentence_break() {
        let (flush, rest) = split_at_best_break("你好世界。更多内容");
        assert_eq!(flush, "你好世界。");
        assert_eq!(rest, "更多内容");
    }
}
