"use client";

import React, { type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import type { OrbVariant } from "./orb-shader";

export type VoiceOrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking"
  | "processing"
  | "toolcalling"
  | "muted"
  | "error";

export type VoiceOrbVariant = OrbVariant | (string & {});

export interface VoiceOrbProps extends Omit<ComponentProps<"div">, "children"> {
  state?: VoiceOrbState;
  variant?: VoiceOrbVariant;
  customColor?: string;
  amplitude?: number; // 0 to 1 audio volume level
  size?: number; // Size in px (default: 156)
}

/**
 * Authentic Phosai Pulsating Bubble Voice Orb
 * Sourced directly from phosai-mobile (AssistantUIVoiceConversation):
 * Clean concentric pulsating rings scaling with live amplitude in signature Phos Golden Amber (#D9A700).
 */
export function VoiceOrb({
  state = "idle",
  variant: _variant,
  customColor,
  amplitude = 0,
  size = 156,
  className,
  style,
  ...props
}: VoiceOrbProps) {
  const clampedAmp = Math.max(0, Math.min(1, amplitude));
  const isMuted = state === "muted";
  const isError = state === "error";
  const isLive = state === "listening" || state === "speaking";
  const isProcessing =
    state === "connecting" ||
    state === "thinking" ||
    state === "processing" ||
    state === "toolcalling";

  // Dynamic scales matching phosai-mobile:
  // Ring 1 (middle): 1.0 to 1.45 based on amplitude
  // Ring 2 (outer):  1.0 to 1.75 based on amplitude
  const ring1Scale = isLive ? 1.0 + clampedAmp * 0.45 : isProcessing ? 1.06 : 1.0;
  const ring2Scale = isLive ? 1.0 + clampedAmp * 0.75 : isProcessing ? 1.12 : 1.0;

  // Opacities matching phosai-mobile:
  const ring1Opacity = isMuted ? 0.12 : isError ? 0.18 : isLive ? 0.45 + clampedAmp * 0.35 : 0.25;
  const ring2Opacity = isMuted ? 0.08 : isError ? 0.12 : isLive ? 0.25 + clampedAmp * 0.4 : 0.15;

  // Theme colors: signature Phos golden amber (#D9A700)
  const themeColor = customColor || (isMuted ? "#71717A" : isError ? "#EF4444" : "#D9A700");
  const ringColor = isMuted
    ? "rgba(113, 113, 122, 0.2)"
    : isError
    ? "rgba(239, 68, 68, 0.2)"
    : "rgba(217, 167, 0, 0.22)";

  // Scale factor relative to base size (156px)
  const scale = size / 156;

  return (
    <div
      data-slot="voice-orb"
      data-state={state}
      className={cn(
        "relative flex items-center justify-center select-none pointer-events-none transition-transform",
        className
      )}
      style={{
        width: size,
        height: size,
        ...style,
      }}
      {...props}
    >
      <div
        className="relative flex items-center justify-center pointer-events-auto"
        style={{
          width: 156,
          height: 156,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {/* Outer Ring 2 (148px) */}
        <div
          className={cn(
            "absolute rounded-full transition-transform duration-100 ease-out",
            (isProcessing || state === "speaking") && "animate-pulse"
          )}
          style={{
            width: 148,
            height: 148,
            backgroundColor: ringColor,
            opacity: ring2Opacity,
            transform: `scale(${ring2Scale})`,
          }}
        />

        {/* Middle Ring 1 (104px) */}
        <div
          className={cn(
            "absolute rounded-full transition-transform duration-100 ease-out",
            (isProcessing || state === "speaking") && "animate-pulse"
          )}
          style={{
            width: 104,
            height: 104,
            backgroundColor: ringColor,
            opacity: ring1Opacity,
            transform: `scale(${ring1Scale})`,
          }}
        />

        {/* Core Center Bubble (60px) */}
        <div
          className={cn(
            "relative rounded-full transition-all duration-200 ease-out",
            isProcessing && "animate-pulse"
          )}
          style={{
            width: 60,
            height: 60,
            backgroundColor: themeColor,
            boxShadow: isMuted
              ? "0 4px 16px rgba(113, 113, 122, 0.3)"
              : isError
              ? "0 4px 16px rgba(239, 68, 68, 0.4)"
              : "0 4px 20px rgba(217, 167, 0, 0.45)",
            transform: isLive ? `scale(${1.0 + clampedAmp * 0.15})` : undefined,
          }}
        />
      </div>
    </div>
  );
}
