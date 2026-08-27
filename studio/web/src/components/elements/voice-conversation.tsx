"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { paper, mono } from "./surfaces";
import { VoiceOrb, type VoiceOrbState, type VoiceOrbVariant } from "@/components/assistant-ui/voice-orb";
import { VoiceControl } from "@/components/assistant-ui/voice-control";

export type VoiceMode = "connecting" | "listening" | "thinking" | "speaking" | "idle";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
}

export function VoiceConversation({
  mode,
  amplitude,
  transcript,
  muted = false,
  variant = "default",
  onToggleMute,
  onInterrupt,
  onEnd,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "mode"
  | "amplitude"
  | "transcript"
  | "muted"
  | "onToggleMute"
  | "onInterrupt"
  | "onEnd"
> & {
  mode: VoiceMode;
  amplitude: number;
  transcript: readonly VoiceTurn[];
  muted?: boolean;
  variant?: VoiceOrbVariant;
  onToggleMute?: () => void;
  onInterrupt?: () => void;
  onEnd?: () => void;
}) {
  const orbState: VoiceOrbState = muted ? "muted" : mode;
  const canInterrupt = mode === "speaking" && onInterrupt !== undefined;

  return (
    <div
      data-slot="voice-conversation"
      className={cn(
        paper,
        "flex w-full h-full flex-1 max-w-3xl flex-col items-center justify-between gap-6 rounded-[28px] px-8 py-8 transition-all shadow-xl border border-border/40",
        className
      )}
      {...props}
    >
      {/* Orb Visual Section */}
      <div className="flex flex-col items-center gap-4 w-full pt-4">
        <button
          type="button"
          onClick={onInterrupt}
          disabled={!canInterrupt}
          aria-label={canInterrupt ? "Interrupt assistant" : "Voice visualizer"}
          className={cn(
            "group relative flex items-center justify-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-primary/40",
            canInterrupt ? "cursor-pointer hover:scale-105" : "cursor-default"
          )}
        >
          <VoiceOrb
            state={orbState}
            variant={variant}
            amplitude={amplitude}
          />
        </button>

        {canInterrupt && (
          <span className={cn(mono, "text-xs text-primary font-medium animate-pulse")}>
            Tap orb to interrupt
          </span>
        )}
      </div>

      {/* Realtime Transcript Section */}
      <div className="flex flex-1 min-h-[200px] max-h-[45vh] overflow-y-auto w-full flex-col gap-2 px-4 py-3 border border-border/40 rounded-2xl bg-muted/20 custom-scrollbar">
        {transcript.length === 0 ? (
          <div className="my-auto text-center text-xs font-mono text-muted-foreground/60">
            Waiting for conversation to begin...
          </div>
        ) : (
          transcript.map((turn) => (
            <div
              key={turn.id}
              className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both flex gap-3 text-xs leading-relaxed duration-300 py-1"
            >
              <span
                className={cn(
                  mono,
                  "w-9 shrink-0 font-bold uppercase tracking-wider text-[11px]",
                  turn.role === "user"
                    ? "text-foreground/40"
                    : "text-primary font-bold"
                )}
              >
                {turn.role === "user" ? "you" : "ai"}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  turn.role === "user"
                    ? "text-foreground/70"
                    : "text-foreground/90 font-medium"
                )}
              >
                {turn.text}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Assistant-UI Style Voice Control Bar */}
      <VoiceControl
        state={orbState}
        muted={muted}
        onToggleMute={onToggleMute}
        onDisconnect={onEnd}
        amplitude={amplitude}
        className="w-full max-w-md"
      />
    </div>
  );
}

