"use client";

import { useState, useEffect, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GlobeIcon,
  Layers01Icon,
  PaintBoardIcon,
  LayoutBottomIcon,
  Copy01Icon,
  Tick02Icon,
  MessageMultiple01Icon,
  Mic01Icon,
  Settings05Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";
import { VoiceModal } from "@/components/assistant-ui/voice-modal";
import { VoiceOrbVariant } from "@/components/assistant-ui/voice-orb";

interface EmbedConfigViewProps {
  agentId: string;
  agentName?: string;
}

type EmbedMode = "chat" | "voice" | "hybrid";
type EmbedPosition = "bottom-right" | "bottom-left";

const PRESET_COLORS: Array<{ id: string; label: string; hex: string }> = [
  { id: "amber", label: "Amber Gold", hex: "#EAB308" },
  { id: "blue", label: "Ocean Blue", hex: "#2563EB" },
  { id: "violet", label: "Royal Violet", hex: "#7C3AED" },
  { id: "emerald", label: "Emerald Green", hex: "#059669" },
  { id: "rose", label: "Rose Pink", hex: "#E11D48" },
  { id: "orange", label: "Sunset Orange", hex: "#EA580C" },
  { id: "dark", label: "Midnight Slate", hex: "#0F172A" },
];

export default function EmbedConfigView({ agentId, agentName = "Voice Agent" }: EmbedConfigViewProps) {
  const [mode, setMode] = useState<EmbedMode>("chat");
  const [brandColor, setBrandColor] = useState<string>("#EAB308");
  const [position, setPosition] = useState<EmbedPosition>("bottom-right");
  const [title, setTitle] = useState(agentName);
  const [autoOpen, setAutoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "voice">("chat");
  const [origin, setOrigin] = useState<string>("https://app.phosai.com");

  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const encodedColor = encodeURIComponent(brandColor);

  const scriptSnippet = `<script
  src="${origin}/embed.js"
  data-agent-id="${agentId}"
  data-mode="${mode}"
  data-color="${brandColor}"
  data-position="${position}"${title ? `\n  data-title="${title}"` : ""}${autoOpen ? `\n  data-auto-open="true"` : ""}
  defer
></script>`;

  const iframeSnippet = `<iframe
  src="${origin}/embed/${agentId}?mode=${mode}&color=${encodedColor}&position=${position}${title ? `&title=${encodeURIComponent(title)}` : ""}"
  width="400"
  height="640"
  style="border:none; background:transparent;"
  allow="microphone"
></iframe>`;

  const directUrl = `${origin}/embed/${agentId}?mode=${mode}&color=${encodedColor}&position=${position}${title ? `&title=${encodeURIComponent(title)}` : ""}`;

  const handleCopy = useCallback(async (content: string, format: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedFormat(format);
      toast.success(`${format} copied to clipboard!`);
      setTimeout(() => setCopiedFormat(null), 2500);
    } catch {
      toast.error("Failed to copy snippet");
    }
  }, []);

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-background overflow-y-auto custom-scrollbar">
      {/* ── Left Settings & Code Generator Column ── */}
      <div className="w-full lg:w-1/2 p-6 space-y-6 border-b lg:border-b-0 lg:border-r border-border/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary font-mono text-[10px] uppercase">
              <HugeiconsIcon icon={GlobeIcon} className="size-3" />
              Website Widget
            </Badge>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Embed Configurator</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Customize theme colors, launcher position, and embed your assistant onto any website with a single script tag.
          </p>
        </div>

        {/* Customization Options */}
        <div className="space-y-4 rounded-2xl border border-border/60 bg-card/40 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground border-b border-border/40 pb-2">
            <HugeiconsIcon icon={Settings05Icon} className="size-4 text-primary" />
            Widget Appearance & Controls
          </div>

          {/* Mode Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <HugeiconsIcon icon={Layers01Icon} className="size-3.5" />
              Embed Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMode("chat")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
                  mode === "chat"
                    ? "border-primary bg-primary/10 text-primary shadow-xs"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={MessageMultiple01Icon} className="size-3.5" />
                Chat
              </button>

              <button
                type="button"
                onClick={() => setMode("voice")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
                  mode === "voice"
                    ? "border-primary bg-primary/10 text-primary shadow-xs"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={Mic01Icon} className="size-3.5" />
                Voice
              </button>

              <button
                type="button"
                onClick={() => setMode("hybrid")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-semibold transition-all",
                  mode === "hybrid"
                    ? "border-primary bg-primary/10 text-primary shadow-xs"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={Layers01Icon} className="size-3.5" />
                Hybrid
              </button>
            </div>
          </div>

          {/* Brand Color Theme Selection */}
          <div className="space-y-2 pt-1">
            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <HugeiconsIcon icon={PaintBoardIcon} className="size-3.5" />
                Brand Color Theme
              </span>
              <span className="font-mono text-[10px] text-primary">{brandColor.toUpperCase()}</span>
            </label>

            {/* Presets Grid */}
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setBrandColor(p.hex)}
                  title={p.label}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    brandColor.toLowerCase() === p.hex.toLowerCase()
                      ? "border-primary bg-primary/10 text-foreground font-bold shadow-xs"
                      : "border-border/60 bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className="size-3.5 rounded-full border border-black/10 shadow-2xs shrink-0"
                    style={{ backgroundColor: p.hex }}
                  />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Custom Hex Color Picker */}
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex items-center shrink-0">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="size-8 rounded-lg border border-border cursor-pointer bg-transparent p-0 overflow-hidden"
                  title="Pick custom brand color"
                />
              </div>
              <div className="flex-1 relative">
                <Input
                  type="text"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="#HEX Code"
                  className="h-8 font-mono text-xs uppercase"
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">Custom Hex</span>
            </div>
          </div>

          {/* Position & Title Row */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                <HugeiconsIcon icon={LayoutBottomIcon} className="size-3.5" />
                Position
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as EmbedPosition)}
                className="w-full bg-background border border-border/60 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Assistant Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="h-8 text-xs rounded-xl"
              />
            </div>
          </div>
        </div>

        {/* Generated Code Snippets */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            Embed Snippets
          </h3>

          {/* HTML Script Tag (Recommended) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                HTML Script Tag <Badge className="text-[9px] py-0 bg-primary/10 text-primary border-none">Recommended</Badge>
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(scriptSnippet, "HTML Script Tag")}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={copiedFormat === "HTML Script Tag" ? Tick02Icon : Copy01Icon}
                  className="size-3.5"
                />
                {copiedFormat === "HTML Script Tag" ? "Copied!" : "Copy Tag"}
              </Button>
            </div>
            <pre className="p-3.5 rounded-xl bg-muted/80 border border-border/60 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto select-all custom-scrollbar">
              {scriptSnippet}
            </pre>
          </div>

          {/* React / Iframe Snippet */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">React / Iframe Embed</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(iframeSnippet, "Iframe Code")}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={copiedFormat === "Iframe Code" ? Tick02Icon : Copy01Icon}
                  className="size-3.5"
                />
                {copiedFormat === "Iframe Code" ? "Copied!" : "Copy Code"}
              </Button>
            </div>
            <pre className="p-3.5 rounded-xl bg-muted/80 border border-border/60 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto select-all custom-scrollbar">
              {iframeSnippet}
            </pre>
          </div>

          {/* Direct URL */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">Direct Web Link</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleCopy(directUrl, "Direct Link")}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon
                  icon={copiedFormat === "Direct Link" ? Tick02Icon : Copy01Icon}
                  className="size-3.5"
                />
                {copiedFormat === "Direct Link" ? "Copied!" : "Copy URL"}
              </Button>
            </div>
            <pre className="p-3.5 rounded-xl bg-muted/80 border border-border/60 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto select-all custom-scrollbar">
              {directUrl}
            </pre>
          </div>
        </div>
      </div>

      {/* ── Right Live Interactive Mockup Column ── */}
      <div className="w-full lg:w-1/2 p-6 flex flex-col justify-between bg-muted/30 relative min-h-[550px] overflow-hidden" style={{ "--primary": brandColor } as React.CSSProperties}>
        {/* Mockup Website Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-400/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <span className="text-[11px] font-mono text-muted-foreground pl-2">
              yourcompany.com
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-border/60">
              Live Embed Preview
            </Badge>
          </div>
        </div>

        {/* Mockup Hero Content */}
        <div className="my-auto max-w-sm space-y-3 p-4">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
            Acme
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Welcome to Acme Corp
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This live preview demonstrates how the embedded PhosAI widget launcher will appear on your customer website with your brand color theme.
          </p>
        </div>

        {/* Live Interactive Floating Widget Preview */}
        <div
          className={cn(
            "absolute z-30 transition-all duration-300",
            position === "bottom-right" ? "bottom-6 right-6" : "bottom-6 left-6"
          )}
        >
          {mode === "chat" && (
            <AssistantModal
              title={title}
              variant="default"
              style={{ "--primary": brandColor } as React.CSSProperties}
            />
          )}

          {mode === "voice" && (
            <VoiceModal
              title={title}
              variant="default"
              style={{ "--primary": brandColor } as React.CSSProperties}
            />
          )}

          {mode === "hybrid" && (
            <div className="flex flex-col items-end space-y-2">
              <div className="flex items-center gap-1 bg-card/90 backdrop-blur-md p-1 rounded-full border border-border/80 shadow-md">
                <button
                  type="button"
                  onClick={() => setActiveTab("chat")}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                    activeTab === "chat"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("voice")}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                    activeTab === "voice"
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Voice
                </button>
              </div>

              {activeTab === "chat" ? (
                <AssistantModal
                  title={title}
                  variant="default"
                  style={{ "--primary": brandColor } as React.CSSProperties}
                />
              ) : (
                <VoiceModal
                  title={title}
                  variant="default"
                  style={{ "--primary": brandColor } as React.CSSProperties}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
