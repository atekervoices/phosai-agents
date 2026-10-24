"use client";

import type { ComponentProps } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mic01Icon,
  MicOffIcon,
  CallDisabled02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { VoiceOrbState, VoiceOrb } from "./voice-orb";

export interface VoiceControlProps extends ComponentProps<"div"> {
  state?: VoiceOrbState;
  muted?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onToggleMute?: () => void;
  amplitude?: number;
}

const STATE_CAPTIONS: Record<VoiceOrbState, string> = {
  idle: "Ready to start",
  connecting: "Connecting...",
  listening: "Listening",
  thinking: "Thinking...",
  speaking: "Speaking",
  muted: "Microphone muted",
  processing: "Processing...",
  toolcalling: "Working...",
  error: "Error",
};

export function VoiceIndicator({
  state = "idle",
  muted = false,
  className,
}: {
  state?: VoiceOrbState;
  muted?: boolean;
  className?: string;
}) {
  const displayState = muted && state !== "idle" && state !== "connecting" ? "muted" : state;

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-xs font-medium", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full transition-all duration-300",
          displayState === "idle" && "bg-muted-foreground/40",
          displayState === "connecting" && "bg-amber-500 animate-ping",
          displayState === "listening" && "bg-emerald-500 animate-pulse",
          displayState === "thinking" && "bg-blue-500 animate-spin",
          displayState === "speaking" && "bg-amber-500 animate-pulse",
          displayState === "muted" && "bg-red-500"
        )}
      />
      <span className="text-foreground/80">{STATE_CAPTIONS[displayState]}</span>
    </div>
  );
}

export function VoiceConnectButton({
  onClick,
  disabled,
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Start voice session"
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 active:scale-95 rounded-full shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={PlayIcon} className="size-3.5 fill-current" />
      <span>Connect</span>
    </button>
  );
}

export function VoiceMuteButton({
  muted = false,
  onClick,
  disabled,
  className,
  ...props
}: ComponentProps<"button"> & { muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
      aria-pressed={muted}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-border/80 bg-background text-foreground/80 hover:bg-muted hover:text-foreground active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none",
        muted && "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20",
        className
      )}
      {...props}
    >
      {muted ? (
        <HugeiconsIcon icon={MicOffIcon} className="size-4" />
      ) : (
        <HugeiconsIcon icon={Mic01Icon} className="size-4" />
      )}
    </button>
  );
}

export function VoiceDisconnectButton({
  onClick,
  disabled,
  className,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="End voice session"
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={CallDisabled02Icon} className="size-4" />
    </button>
  );
}

export function VoiceControl({
  state = "idle",
  muted = false,
  onConnect,
  onDisconnect,
  onToggleMute,
  amplitude = 0,
  className,
  ...props
}: VoiceControlProps) {
  const isSessionActive = state !== "idle";

  return (
    <div
      data-slot="voice-control"
      className={cn(
        "aui-voice-control flex items-center justify-between gap-3 px-4 py-2.5 rounded-full border border-border/60 bg-card/80 backdrop-blur-md shadow-lg transition-all",
        className
      )}
      {...props}
    >
      <VoiceIndicator state={state} muted={muted} />

      <div className="flex items-center gap-2">
        {!isSessionActive && onConnect && (
          <VoiceConnectButton onClick={onConnect} />
        )}

        {isSessionActive && (
          <>
            {onToggleMute && (
              <VoiceMuteButton muted={muted} onClick={onToggleMute} />
            )}
            {onDisconnect && (
              <VoiceDisconnectButton onClick={onDisconnect} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
