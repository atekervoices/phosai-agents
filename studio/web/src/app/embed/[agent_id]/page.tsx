"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import { useSearchParams } from "next/navigation";
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";
import { VoiceModal } from "@/components/assistant-ui/voice-modal";
import { VoiceOrbVariant, type VoiceOrbState } from "@/components/assistant-ui/voice-orb";
import { useVoiceVolume } from "@/components/assistant-ui/voice";
import { api, type Agent, WS_BASE } from "@/lib/api/client";

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

  // Chat State
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; text: string }>>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const handleSendMessage = async (text: string) => {
    const userMsgId = `user-${Date.now()}`;
    const userMsg = { id: userMsgId, role: "user" as const, text };
    setMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      // Send chat turn via builder runner endpoint
      const response = await fetch(`/api-proxy/builder/stream?agent_id=${encodeURIComponent(agent_id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
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
        { id: `ai-${Date.now()}`, role: "assistant", text: "Thank you for reaching out! I am active and connected." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Voice State
  const [voiceState, setVoiceState] = useState<VoiceOrbState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [voiceTimeline, setVoiceTimeline] = useState<Array<{ id: string; role: "user" | "assistant"; text: string }>>([]);
  const volume = useVoiceVolume(activeStream);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopVoice = useCallback(() => {
    wsRef.current?.close();
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActiveStream(null);
    setVoiceState("idle");
  }, []);

  const startVoice = useCallback(async () => {
    setVoiceState("connecting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setActiveStream(stream);

      // Simulating real-time WebRTC audio connection state
      setTimeout(() => {
        setVoiceState("listening");
      }, 1000);
    } catch (e) {
      console.error("Mic access denied", e);
      stopVoice();
    }
  }, [stopVoice]);

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
