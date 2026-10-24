"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mic01Icon,
  MicOffIcon,
  CallDisabled02Icon,
  Call02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { mono } from "./surfaces";
import { VoiceOrb, type VoiceOrbState, type VoiceOrbVariant } from "@/components/assistant-ui/voice-orb";

export type VoiceMode = "connecting" | "listening" | "thinking" | "speaking" | "idle";

export interface VoiceTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  isPartial?: boolean;
}

export interface VoiceConversationProps extends Omit<
  ComponentProps<"div">,
  | "children"
  | "mode"
  | "amplitude"
  | "transcript"
  | "muted"
  | "onToggleMute"
  | "onInterrupt"
  | "onEnd"
> {
  mode: VoiceMode;
  amplitude: number;
  transcript: readonly VoiceTurn[];
  muted?: boolean;
  variant?: VoiceOrbVariant;
  agentName?: string;
  onToggleMute?: () => void;
  onInterrupt?: () => void;
  onEnd?: () => void;
  onStart?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function VoiceConversation({
  mode,
  amplitude,
  transcript,
  muted = false,
  variant = "default",
  agentName = "AI Agent",
  onToggleMute,
  onInterrupt,
  onEnd,
  onStart,
  disabled = false,
  disabledReason,
  className,
  ...props
}: VoiceConversationProps) {
  const orbState: VoiceOrbState = muted && mode !== "idle" ? "muted" : mode;
  const canInterrupt = mode === "speaking" && onInterrupt !== undefined;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcripts to the bottom on new message / streaming chunk
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [transcript]);

  // Caption matching phosai-mobile spec:
  // "The caption under the orb reads 'Mic off' whenever muted is true, taking priority over the interrupt hint even while speaking."
  const getCaption = () => {
    if (muted && mode !== "idle") {
      return { title: "Mic off", hint: undefined, isMuted: true };
    }
    switch (mode) {
      case "speaking":
        return {
          title: "Speaking",
          hint: canInterrupt ? "Tap to interrupt" : undefined,
          isMuted: false,
        };
      case "listening":
        return { title: "Listening", hint: undefined, isMuted: false };
      case "thinking":
        return { title: "Thinking...", hint: undefined, isMuted: false };
      case "connecting":
        return { title: "Connecting...", hint: undefined, isMuted: false };
      case "idle":
      default:
        return { title: "Ready", hint: undefined, isMuted: false };
    }
  };

  const caption = getCaption();

  return (
    <div
      data-slot="voice-conversation"
      className={cn(
        "flex w-full h-full flex-1 max-w-xl flex-col items-center justify-between gap-4 rounded-3xl p-6 transition-all bg-card/70 backdrop-blur-md border border-border/60 shadow-xl",
        className
      )}
      {...props}
    >
      {/* 1. Top Orb Section with Turn Caption & Interrupt Hint */}
      <div className="flex flex-col items-center justify-center pt-2 select-none">
        <button
          type="button"
          onClick={canInterrupt ? onInterrupt : undefined}
          disabled={!canInterrupt}
          aria-label={canInterrupt ? "Interrupt assistant" : caption.title}
          className={cn(
            "group relative flex items-center justify-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[#D9A700]/40",
            canInterrupt ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default"
          )}
        >
          <VoiceOrb
            state={orbState}
            variant={variant}
            amplitude={amplitude}
          />
        </button>

        {/* Turn Caption & Hint */}
        <div className="flex flex-col items-center justify-center mt-3 gap-0.5">
          <span
            className={cn(
              "text-base font-bold tracking-tight text-foreground",
              caption.isMuted && "text-destructive"
            )}
          >
            {caption.title}
          </span>
          {caption.hint ? (
            <span className={cn(mono, "text-[11px] text-muted-foreground animate-pulse")}>
              {caption.hint}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground/50 h-4" />
          )}
        </div>
      </div>

      {/* 2. Inline Tabular Transcript Rows (exact layout from phosai-mobile) */}
      <div
        ref={scrollRef}
        className="flex flex-1 min-h-[180px] max-h-[38vh] w-full flex-col gap-3 overflow-y-auto px-4 py-3 rounded-2xl bg-muted/20 border border-border/30 custom-scrollbar"
      >
        {transcript.length === 0 ? (
          <div className="my-auto text-center text-xs text-muted-foreground/70 py-6">
            {mode === "idle"
              ? `Tap below to start speaking with ${agentName}`
              : "Listening for voice input..."}
          </div>
        ) : (
          transcript.map((turn) => {
            const isAi = turn.role === "assistant";
            return (
              <div
                key={turn.id}
                className="flex items-start gap-3 text-xs leading-relaxed py-0.5 animate-in fade-in duration-200"
              >
                {/* Left Role Column: 'you' vs 'ai' in Phos Golden Amber */}
                <span
                  className={cn(
                    mono,
                    "w-8 shrink-0 font-bold uppercase tracking-wider text-[11px] pt-0.5 select-none",
                    isAi ? "text-[#D9A700] dark:text-[#EAB308] font-extrabold" : "text-muted-foreground/70 font-semibold"
                  )}
                >
                  {isAi ? "ai" : "you"}
                </span>

                {/* Right Turn Content: Clean neutral text (NEVER BLUE) */}
                <span className="min-w-0 flex-1 break-words font-normal leading-relaxed text-[13px] text-foreground/90">
                  {turn.text}
                  {turn.isPartial && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#D9A700] animate-pulse align-middle rounded-sm" />
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Call Controls (matching phosai-mobile AssistantUIVoiceConversation) */}
      <div className="flex items-center justify-center gap-6 pb-2 pt-1 w-full">
        {mode !== "idle" ? (
          <>
            {/* Mic / Mute Toggle Button */}
            {onToggleMute && (
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                className={cn(
                  "flex size-12 items-center justify-center rounded-full border transition-all active:scale-95 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D9A700]/40",
                  muted
                    ? "bg-destructive/15 border-destructive/40 text-destructive hover:bg-destructive/25"
                    : "bg-background border-border/80 text-foreground/80 hover:bg-muted hover:text-foreground"
                )}
              >
                <HugeiconsIcon
                  icon={muted ? MicOffIcon : Mic01Icon}
                  className="size-5"
                />
              </button>
            )}

            {/* End Call Button */}
            {onEnd && (
              <button
                type="button"
                onClick={onEnd}
                aria-label="End conversation"
                className="flex size-14 items-center justify-center rounded-full bg-[#EF4444] text-white shadow-lg shadow-red-500/25 transition-all hover:bg-red-600 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <HugeiconsIcon
                  icon={CallDisabled02Icon}
                  className="size-6"
                />
              </button>
            )}
          </>
        ) : (
          /* Start Voice Call Action (matching phosai-mobile signature button) */
          onStart && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onStart}
                disabled={disabled}
                className={cn(
                  "inline-flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full bg-[#D9A700] hover:bg-[#C69500] text-white font-semibold text-sm shadow-lg shadow-[#D9A700]/30 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-[#D9A700]/50"
                )}
              >
                <HugeiconsIcon icon={Call02Icon} className="size-4" />
                <span>Start Voice Call</span>
              </button>
              {disabledReason && (
                <span className="text-xs text-destructive font-medium">
                  {disabledReason}
                </span>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
