"use client";

import { useRef, useState, useCallback, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type AudioStatus = "idle" | "requesting" | "recording" | "processing" | "error";

interface UseVoiceOptions {
  onAudioChunk?: (base64Chunk: string) => void;
  onRecordingComplete?: (audioBlob: Blob) => void;
  chunkIntervalMs?: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVoice({
  onAudioChunk,
  onRecordingComplete,
  chunkIntervalMs = 250,
}: UseVoiceOptions = {}) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [decibels, setDecibels] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Volume visualisation via Web Audio API
  const startVisualization = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setDecibels(Math.round(avg));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopVisualization = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setDecibels(0);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setStatus("requesting");
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,   // Gemini Live API preferred sample rate
          channelCount: 1,     // Mono
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);

          if (onAudioChunk) {
            // Convert blob to base64 and stream to relay
            const buffer = await e.data.arrayBuffer();
            const base64 = btoa(
              String.fromCharCode(...new Uint8Array(buffer))
            );
            onAudioChunk(base64);
          }
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecordingComplete?.(fullBlob);
        stopVisualization();
      };

      // Stream chunks every `chunkIntervalMs` for low-latency relay
      recorder.start(chunkIntervalMs);
      setStatus("recording");
      startVisualization(stream);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setStatus("error");
    }
  }, [onAudioChunk, onRecordingComplete, chunkIntervalMs, startVisualization, stopVisualization]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setStatus("processing");
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVisualization();
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopVisualization]);

  return {
    status,
    error,
    decibels,
    isRecording: status === "recording",
    startRecording,
    stopRecording,
  };
}
