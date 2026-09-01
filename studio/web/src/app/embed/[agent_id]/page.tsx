"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";
import { VoiceModal } from "@/components/assistant-ui/voice-modal";
import { VoiceOrbVariant, type VoiceOrbState } from "@/components/assistant-ui/voice-orb";
import { useVoiceVolume } from "@/components/assistant-ui/voice";
import { api, type Agent } from "@/lib/api/client";

interface PageProps {
  params: Promise<{ agent_id: string }>;
}

export default function PublicEmbedPage({ params }: PageProps) {
  const { agent_id } = use(params);
  const searchParams = useSearchParams();

  const modeParam = (searchParams.get("mode") || "chat") as "chat" | "voice" | "hybrid";
  const rawColorParam = searchParams.get("color") || "#EAB308";
  const positionParam = (searchParams.get("position") || "bottom-right") as "bottom-right" | "bottom-left";
  const titleParam = searchParams.get("title") || "";
  const autoOpenParam = searchParams.get("autoOpen") === "true";

  // Map preset names or hex codes to brand color hex
  const PRESET_HEX_MAP: Record<string, string> = {
    default: "#EAB308",
    amber: "#EAB308",
    blue: "#2563EB",
    violet: "#7C3AED",
    emerald: "#059669",
    rose: "#E11D48",
    orange: "#EA580C",
    dark: "#0F172A",
  };

  const primaryHex = rawColorParam.startsWith("#")
    ? rawColorParam
    : PRESET_HEX_MAP[rawColorParam.toLowerCase()] || "#EAB308";

  const colorParam = (
    rawColorParam in PRESET_HEX_MAP ? rawColorParam : "default"
  ) as VoiceOrbVariant;

  const [activeTab, setActiveTab] = useState<"chat" | "voice">(modeParam === "voice" ? "voice" : "chat");
  const [open, setOpen] = useState(autoOpenParam);
  const [agent, setAgent] = useState<Agent | null>(null);

  // Notify parent window of open state change for iframe resizing
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    try {
      window.parent.postMessage(
        JSON.stringify({ type: "phosai-embed-resize", open: isOpen, agentId: agent_id }),
        "*"
      );
    } catch {
      /* ignore */
    }
  }, [agent_id]);

  useEffect(() => {
    handleOpenChange(autoOpenParam);
  }, [autoOpenParam, handleOpenChange]);

  // Load Agent info
  useEffect(() => {
    if (!agent_id) return;
    api.agents
      .get(agent_id)
      .then(setAgent)
      .catch(() => {});
  }, [agent_id]);

  // ── Chat State (via text-test WebSocket) ────────────────────────
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; text: string }>>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const textWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!open || (modeParam !== "chat" && activeTab !== "chat") || !agent_id) return;

    if (textWsRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/voice/text-test/${agent_id}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }
    textWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === "ready" && data.greeting) {
          setMessages((prev) => {
            if (prev.length > 0) return prev;
            return [{ id: `ai-greet-${Date.now()}`, role: "assistant", text: data.greeting as string }];
          });
        } else if (data.type === "transcript") {
          const role = (data.role as "user" | "assistant") || "assistant";
          const text = (data.text as string) || "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === role && role === "assistant") {
              return [...prev.slice(0, -1), { ...last, text }];
            }
            return [...prev, { id: `ai-${Date.now()}`, role, text }];
          });
          setIsChatLoading(false);
        } else if (data.type === "processing") {
          setIsChatLoading(true);
        } else if (data.type === "turn_complete") {
          setIsChatLoading(false);
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      textWsRef.current = null;
      setIsChatLoading(false);
    };

    return () => {
      ws.close();
      textWsRef.current = null;
    };
  }, [open, modeParam, activeTab, agent_id]);

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg = { id: userMsgId, role: "user" as const, text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);

    if (textWsRef.current && textWsRef.current.readyState === WebSocket.OPEN) {
      textWsRef.current.send(JSON.stringify({ type: "text", text: trimmed }));
    } else {
      // Fallback via builder API
      try {
        const response = await fetch(`/api-proxy/builder/stream?agent_id=${encodeURIComponent(agent_id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!response.ok) throw new Error("API stream error");
        const data = await response.json();
        const replyText = data.text || data.response || "I have received your message.";

        setMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, role: "assistant", text: replyText },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: `ai-${Date.now()}`, role: "assistant", text: "Thank you for reaching out! How can I assist you further?" },
        ]);
      } finally {
        setIsChatLoading(false);
      }
    }
  };

  // ── Voice State (WebRTC audio + WebSocket events) ───────────────
  const [voiceState, setVoiceState] = useState<VoiceOrbState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [voiceTimeline, setVoiceTimeline] = useState<Array<{ id: string; role: "user" | "assistant"; text: string }>>([]);
  const volume = useVoiceVolume(activeStream);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopVoice = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    const pc = pcRef.current;
    pcRef.current = null;
    const audio = remoteAudioRef.current;
    const stream = streamRef.current;
    streamRef.current = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "session.end" }));
      } catch {
        /* ignore */
      }
    }
    ws?.close();
    pc?.close();
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    stream?.getTracks().forEach((t) => t.stop());
    setActiveStream(null);
    setVoiceState("idle");
  }, []);

  const handleWsMsg = useCallback((ev: MessageEvent) => {
    if (ev.data instanceof ArrayBuffer || ev.data instanceof Blob) return;
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state_changed") {
        setVoiceState(msg.state);
      } else if (msg.type === "transcript") {
        const role = (msg.role as "user" | "assistant") || "assistant";
        const text = (msg.text as string) || "";
        setVoiceTimeline((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role && role === "assistant") {
            return [...prev.slice(0, -1), { ...last, text }];
          }
          return [...prev, { id: `voice-t-${Date.now()}`, role, text }];
        });
      } else if (msg.type === "transcript_chunk") {
        const role = (msg.role as "user" | "assistant") || "assistant";
        const text = (msg.text as string) || "";
        setVoiceTimeline((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === role) {
            return [...prev.slice(0, -1), { ...last, text: last.text + text }];
          }
          return [...prev, { id: `voice-chunk-${Date.now()}`, role, text }];
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const startVoice = useCallback(async () => {
    setVoiceState("connecting");
    try {
      // 1. Microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setActiveStream(stream);

      // 2. Register session
      const originHost = window.location.origin;
      const res = await fetch(`${originHost}/voice/session/${agent_id}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Session registration failed: ${res.status}`);
      const { session_id, ws_url, token } = (await res.json()) as {
        session_id: string;
        ws_url: string;
        token: string;
      };

      // 3. ICE servers
      let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
      try {
        const iceRes = await fetch(
          `${originHost}/rtc/ice-servers?session_id=${session_id}&token=${token}`
        );
        if (iceRes.ok) {
          const iceData = await iceRes.json();
          if (iceData.iceServers?.length) iceServers = iceData.iceServers;
        }
      } catch {
        /* fallback */
      }

      // 4. RTCPeerConnection
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }

      pc.ontrack = (e) => {
        if (e.track.kind === "audio") {
          let audio = remoteAudioRef.current;
          if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            remoteAudioRef.current = audio;
          }
          const mediaStream =
            e.streams && e.streams.length > 0 ? e.streams[0] : new MediaStream([e.track]);
          audio.srcObject = mediaStream;
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        }
      };

      const iceCandidateBuffer: string[] = [];
      let offerComplete = false;

      const sendIceCandidate = (candidateSdp: string) => {
        fetch(`${originHost}/rtc/candidate/${session_id}?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate: candidateSdp }),
        }).catch(() => {});
      };

      pc.onicecandidate = (e) => {
        if (!e.candidate || !e.candidate.candidate) return;
        if (!offerComplete) {
          iceCandidateBuffer.push(e.candidate.candidate);
          return;
        }
        sendIceCandidate(e.candidate.candidate);
      };

      // 5. SDP Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      const rtcRes = await fetch(`${originHost}/rtc/offer/${session_id}?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: { sdp: offer.sdp, type: offer.type } }),
      });

      const rtcData = await rtcRes.json();
      if (!rtcRes.ok) throw new Error(rtcData.error || "WebRTC offer failed");
      await pc.setRemoteDescription(new RTCSessionDescription(rtcData.answer));

      offerComplete = true;
      for (const c of iceCandidateBuffer) {
        sendIceCandidate(c);
      }
      iceCandidateBuffer.length = 0;

      // 6. Connect WebSocket for live events
      let resolvedWsUrl = ws_url;
      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      try {
        const parsed = new URL(ws_url.replace(/^wss?:/, "http:"));
        resolvedWsUrl = `${wsProto}//${wsHost}${parsed.pathname}${parsed.search}`;
      } catch {
        if (resolvedWsUrl.startsWith("ws://") && wsProto === "wss:") {
          resolvedWsUrl = resolvedWsUrl.replace(/^ws:\/\//, "wss://");
        }
      }

      const ws = new WebSocket(resolvedWsUrl);
      wsRef.current = ws;
      ws.onmessage = handleWsMsg;
      ws.onerror = () => stopVoice();
      ws.onclose = () => stopVoice();

      setVoiceState("listening");
    } catch (e) {
      console.error("[Embed Voice] Connection error:", e);
      stopVoice();
    }
  }, [agent_id, handleWsMsg, stopVoice]);

  const toggleMute = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsMuted((prev) => !prev);
    }
  }, []);

  const modalTitle = titleParam || agent?.name || "AI Assistant";

  return (
    <div
      className="relative w-full h-full min-h-screen bg-transparent overflow-hidden select-none"
      style={{ "--primary": primaryHex } as React.CSSProperties}
    >
      {/* Audio element for WebRTC agent voice playback */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />

      {/* Mode Switcher for Hybrid Embeds */}
      {modeParam === "hybrid" && open && (
        <div className="fixed bottom-[560px] right-5 z-50 flex items-center p-1 rounded-full bg-background/90 border border-border/80 shadow-lg backdrop-blur-md text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("chat")}
            className={`px-3 py-1 rounded-full transition-all ${
              activeTab === "chat" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("voice")}
            className={`px-3 py-1 rounded-full transition-all ${
              activeTab === "voice" ? "bg-primary text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Voice
          </button>
        </div>
      )}

      {/* Render Chat Widget */}
      {(modeParam === "chat" || (modeParam === "hybrid" && activeTab === "chat")) && (
        <AssistantModal
          open={open}
          onOpenChange={handleOpenChange}
          title={modalTitle}
          variant={colorParam}
          position={positionParam}
          onSendMessage={handleSendMessage}
          messages={messages}
          isLoading={isChatLoading}
          onClearHistory={() => setMessages([])}
        />
      )}

      {/* Render Voice Widget */}
      {(modeParam === "voice" || (modeParam === "hybrid" && activeTab === "voice")) && (
        <VoiceModal
          open={open}
          onOpenChange={handleOpenChange}
          title={modalTitle}
          variant={colorParam}
          position={positionParam}
          state={voiceState}
          amplitude={volume}
          muted={isMuted}
          onConnect={startVoice}
          onDisconnect={stopVoice}
          onToggleMute={toggleMute}
          transcript={voiceTimeline}
        />
      )}
    </div>
  );
}
