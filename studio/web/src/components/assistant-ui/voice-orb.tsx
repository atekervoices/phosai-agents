"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type VoiceOrbState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking"
  | "muted";

export type VoiceOrbVariant = "default" | "blue" | "violet" | "emerald" | (string & {});

export interface VoiceOrbProps extends Omit<ComponentProps<"div">, "children"> {
  state?: VoiceOrbState;
  variant?: VoiceOrbVariant;
  customColor?: string;
  amplitude?: number; // 0 to 1 audio volume level
}

interface Palette {
  gradient: string;
  glow: string;
  ripple: string;
  hex: string;
}

const PALETTES: Record<string, Palette> = {
  default: {
    gradient: "from-amber-300 via-amber-500 to-amber-600",
    glow: "bg-amber-500/25",
    ripple: "border-amber-500/30",
    hex: "#EAB308",
  },
  amber: {
    gradient: "from-amber-300 via-amber-500 to-amber-600",
    glow: "bg-amber-500/25",
    ripple: "border-amber-500/30",
    hex: "#EAB308",
  },
  blue: {
    gradient: "from-blue-300 via-blue-500 to-indigo-600",
    glow: "bg-blue-500/25",
    ripple: "border-blue-500/30",
    hex: "#2563EB",
  },
  violet: {
    gradient: "from-violet-300 via-purple-500 to-violet-700",
    glow: "bg-violet-500/25",
    ripple: "border-violet-500/30",
    hex: "#7C3AED",
  },
  emerald: {
    gradient: "from-emerald-300 via-teal-500 to-emerald-700",
    glow: "bg-emerald-500/25",
    ripple: "border-emerald-500/30",
    hex: "#059669",
  },
};

export function VoiceOrb({
  state = "idle",
  variant = "default",
  customColor,
  amplitude = 0,
  className,
  ...props
}: VoiceOrbProps) {
  const clampAmp = Math.max(0, Math.min(1, amplitude));

  const hexColor =
    customColor ||
    (variant.startsWith("#") ? variant : PALETTES[variant]?.hex || "#EAB308");

  const isPreset = !customColor && !variant.startsWith("#") && variant in PALETTES;
  const palette = isPreset ? PALETTES[variant] : PALETTES.default;

  const isSpeaking = state === "speaking";
  const isListening = state === "listening";
  const isConnecting = state === "connecting";
  const isMuted = state === "muted";
  const isIdle = state === "idle";

  // Dynamic orb scale factor (1.0 to 1.35)
  const scale = isSpeaking || isListening
    ? 1 + clampAmp * 0.35
    : isConnecting
    ? 1.05
    : 1;

  return (
    <div
      data-slot="voice-orb"
      data-state={state}
      data-variant={variant}
      className={cn(
        "relative flex size-48 items-center justify-center select-none",
        className
      )}
      {...props}
    >
      {/* Outer Glow Aura */}
      <div
        className={cn(
          "absolute inset-0 rounded-full blur-3xl transition-all duration-500 pointer-events-none",
          isMuted ? "bg-zinc-500/10" : isPreset ? palette.glow : "",
          isSpeaking && "scale-125 opacity-90",
          isListening && "scale-110 opacity-70",
          isConnecting && "animate-pulse opacity-50",
          isIdle && "opacity-25 scale-90"
        )}
        style={{
          transform: `scale(${scale * 1.2})`,
          ...(!isMuted && !isPreset ? { backgroundColor: hexColor, opacity: isSpeaking ? 0.45 : 0.25 } : {}),
        }}
      />

      {/* Outer Concentric Audio Ripple Ring 3 (Widest) */}
      {(isSpeaking || isListening) && (
        <div
          className={cn(
            "absolute size-44 rounded-full border transition-all duration-700 pointer-events-none",
            isPreset ? palette.ripple : "",
            isSpeaking && "animate-ping opacity-25"
          )}
          style={{
            transform: `scale(${scale * 1.25})`,
            ...(!isPreset ? { borderColor: `${hexColor}25` } : {}),
          }}
        />
      )}

      {/* Concentric Audio Ripple Ring 2 (Middle) */}
      {(isSpeaking || isListening || isConnecting) && (
        <div
          className={cn(
            "absolute size-36 rounded-full border transition-all duration-500 pointer-events-none",
            isPreset ? palette.ripple : "",
            isSpeaking && "animate-pulse opacity-40",
            isListening && "animate-pulse opacity-30"
          )}
          style={{
            transform: `scale(${scale * 1.15})`,
            ...(!isPreset ? { borderColor: `${hexColor}40` } : {}),
          }}
        />
      )}

      {/* Concentric Audio Ripple Ring 1 (Inner) */}
      {(isSpeaking || isListening || isConnecting) && (
        <div
          className={cn(
            "absolute size-28 rounded-full border transition-all duration-300 pointer-events-none",
            isPreset ? palette.ripple : ""
          )}
          style={{
            transform: `scale(${scale * 1.06})`,
            ...(!isPreset ? { borderColor: `${hexColor}60` } : {}),
          }}
        />
      )}

      {/* Rotating orbit ring for connecting */}
      {isConnecting && (
        <div className="absolute size-32 rounded-full border-2 border-dashed border-primary/40 animate-spin duration-3000 pointer-events-none" />
      )}

      {/* 3D Glossy Sphere Main Orb Body */}
      <div
        className={cn(
          "relative size-24 rounded-full transition-all duration-200 ease-out shadow-2xl flex items-center justify-center overflow-hidden",
          isMuted
            ? "bg-gradient-to-tr from-zinc-700 via-zinc-500 to-zinc-400 dark:from-zinc-900 dark:via-zinc-700 dark:to-zinc-600 shadow-zinc-950/40"
            : isPreset
            ? `bg-gradient-to-tr ${palette.gradient}`
            : ""
        )}
        style={{
          transform: `scale(${scale})`,
          ...(!isMuted && !isPreset
            ? {
                background: `radial-gradient(circle at 35% 35%, ${hexColor}, ${hexColor}EE 50%, ${hexColor}99 100%)`,
                boxShadow: `0 12px 30px ${hexColor}60, inset -3px -3px 8px rgba(0,0,0,0.35), inset 3px 3px 8px rgba(255,255,255,0.6)`,
              }
            : {
                boxShadow: isMuted
                  ? "inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 8px rgba(255,255,255,0.3)"
                  : `0 12px 30px ${palette.hex}60, inset -3px -3px 8px rgba(0,0,0,0.35), inset 3px 3px 8px rgba(255,255,255,0.6)`,
              }),
        }}
      >
        {/* Top-left specular glare 3D light highlight reflection */}
        <div className="absolute top-1.5 left-2 size-12 rounded-full bg-gradient-to-b from-white/70 via-white/20 to-transparent blur-[1px] pointer-events-none" />

        {/* Dynamic inner core audio pulsation */}
        <div
          className={cn(
            "size-10 rounded-full transition-all duration-150 blur-xs",
            isMuted ? "bg-zinc-200/20" : "bg-white/50",
            isConnecting && "animate-ping"
          )}
          style={{
            transform: `scale(${0.5 + clampAmp * 0.7})`,
            opacity: isSpeaking || isListening ? 0.9 : 0.35,
          }}
        />
      </div>
    </div>
  );
}
