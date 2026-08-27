"use client";

import { useState, useCallback, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mic01Icon,
  Cancel01Icon,
  Minimize01Icon,
  HeadsetIcon,
  Robot01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { VoiceOrb, type VoiceOrbState, type VoiceOrbVariant } from "./voice-orb";
import { VoiceControl } from "./voice-control";
import { FormattedMarkdown } from "@/components/ui/formatted-markdown";

export interface VoiceModalProps extends ComponentProps<"div"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  variant?: VoiceOrbVariant;
  customColor?: string;
  position?: "bottom-right" | "bottom-left";
  state?: VoiceOrbState;
  amplitude?: number;
  muted?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onToggleMute?: () => void;
  onInterrupt?: () => void;
  transcript?: Array<{ id: string; role: "user" | "assistant"; text: string }>;
}

const LAUNCHER_VARIANTS: Record<string, string> = {
  default: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25",
  amber: "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25",
  blue: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25",
  violet: "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-500/25",
  emerald: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/25",
};

export function VoiceModal({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  title = "Voice Assistant",
  variant = "default",
  customColor,
  position = "bottom-right",
  state = "idle",
  amplitude = 0,
  muted = false,
  onConnect,
  onDisconnect,
  onToggleMute,
  onInterrupt,
  transcript = [],
  className,
  ...props
}: VoiceModalProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const toggleOpen = useCallback(() => {
    const nextState = !isOpen;
    if (controlledOpen === undefined) {
      setInternalOpen(nextState);
    }
    onOpenChange?.(nextState);
  }, [isOpen, controlledOpen, onOpenChange]);

  const isBottomLeft = position === "bottom-left";
  const latestAiTurn = transcript.slice().reverse().find((t) => t.role === "assistant");
  const latestUserTurn = transcript.slice().reverse().find((t) => t.role === "user");

  const hexColor = customColor || (variant.startsWith("#") ? variant : undefined);

  return (
    <div
      data-slot="voice-modal"
      className={cn(
        "fixed z-50 flex flex-col transition-all duration-300 pointer-events-none",
        isBottomLeft ? "bottom-5 left-5 items-start" : "bottom-5 right-5 items-end",
        className
      )}
      {...props}
    >
      {/* Floating Popover Voice Window */}
      {isOpen && (
        <div
          className={cn(
            "pointer-events-auto mb-3 flex flex-col w-[380px] max-w-[calc(100vw-2.5rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-3xl border border-border/80 bg-background/95 backdrop-blur-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          )}
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between border-b border-border/60 bg-muted/30 px-5 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                <HugeiconsIcon icon={HeadsetIcon} className="size-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-tight text-foreground truncate max-w-[180px]">
                  {title}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Realtime Voice Session</span>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleOpen}
              title="Minimize voice modal"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <HugeiconsIcon icon={Minimize01Icon} className="size-4" />
            </button>
          </div>

          {/* Central Voice Visualizer Body */}
          <div className="flex-1 flex flex-col items-center justify-between p-6 overflow-hidden space-y-4">
            {/* Centered VoiceOrb Container */}
            <div className="my-auto flex flex-col items-center justify-center relative py-4">
              <button
                type="button"
                onClick={onInterrupt}
                disabled={state !== "speaking"}
                aria-label="Voice orb indicator"
                className="outline-none focus:outline-none"
              >
                <VoiceOrb
                  state={muted ? "muted" : state}
                  variant={variant}
                  customColor={customColor}
                  amplitude={amplitude}
                />
              </button>
            </div>

            {/* AI Caption Response Card (Matching @assistant-ui/voice Anatomy) */}
            <div className="w-full rounded-2xl border border-border/60 bg-muted/30 p-4 font-sans text-xs leading-relaxed shadow-xs flex items-start gap-3 min-h-[90px] max-h-[120px] overflow-y-auto custom-scrollbar">
              <span className="font-bold text-amber-500 shrink-0 font-mono uppercase text-[11px] mt-0.5">
                {state === "speaking" || latestAiTurn ? "AI" : state === "listening" ? "YOU" : "AI"}
              </span>
              <div className="flex-1 min-w-0 text-foreground/90 leading-relaxed font-normal">
                {state === "speaking" && latestAiTurn ? (
                  <FormattedMarkdown content={latestAiTurn.text} />
                ) : state === "listening" && latestUserTurn ? (
                  <p className="text-muted-foreground italic font-medium">{latestUserTurn.text}</p>
                ) : latestAiTurn ? (
                  <FormattedMarkdown content={latestAiTurn.text} />
                ) : (
                  <p className="text-muted-foreground/80">
                    Hello! Welcome to PhosAI, your destination for innovative AI and Data solutions. How may I assist you with our products today?
                  </p>
                )}
              </div>
            </div>

            {/* Voice Control Bar */}
            <VoiceControl
              state={muted ? "muted" : state}
              muted={muted}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onToggleMute={onToggleMute}
              amplitude={amplitude}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Floating Trigger Launcher Bubble */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? "Close Voice Modal" : "Open Voice Modal"}
        className={cn(
          "pointer-events-auto relative flex size-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/40",
          LAUNCHER_VARIANTS[variant] || "bg-primary text-primary-foreground shadow-lg"
        )}
        style={hexColor ? { backgroundColor: hexColor } : undefined}
      >
        {isOpen ? (
          <HugeiconsIcon icon={Cancel01Icon} className="size-6 transition-transform duration-200 rotate-90" />
        ) : (
          <HugeiconsIcon icon={Mic01Icon} className="size-6 transition-transform duration-200" />
        )}
      </button>
    </div>
  );
}
