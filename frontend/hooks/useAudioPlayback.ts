"use client";

import { useRef, useCallback, useEffect } from "react";

/**
 * Hook for playing back raw PCM 16-bit 24kHz audio chunks in sequence.
 */
export function useAudioPlayback() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
      nextStartTimeRef.current = audioContextRef.current.currentTime;
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, []);

  const playChunk = useCallback((base64Data: string) => {
    initAudio();
    const ctx = audioContextRef.current!;

    // Decode base64
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert Int16 PCM to Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // Create buffer and source
    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule playback to avoid gaps
    const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);
    source.start(startTime);
    nextStartTimeRef.current = startTime + audioBuffer.duration;
  }, [initAudio]);

  const stopAll = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    nextStartTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return { playChunk, stopAll, initAudio };
}
