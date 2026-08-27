"use client";

import { useState, useEffect } from "react";

export * from "./voice-orb";
export * from "./voice-control";
export * from "./assistant-modal";
export * from "./voice-modal";

/**
 * Custom hook to simulate or pass real-time audio volume level (0-1).
 */
export function useVoiceVolume(stream?: MediaStream | null): number {
  const [volume, setVolume] = useState(0);

  useEffect(() => {
    if (!stream) {
      setVolume(0);
      return;
    }

    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let animationFrameId: number;

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, average / 128);
        setVolume(normalized);
        animationFrameId = requestAnimationFrame(updateVolume);
      };

      updateVolume();

      return () => {
        cancelAnimationFrame(animationFrameId);
        source.disconnect();
        audioContext.close();
      };
    } catch (e) {
      console.warn("AudioContext volume measurement error:", e);
    }
  }, [stream]);

  return volume;
}
