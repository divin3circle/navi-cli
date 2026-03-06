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

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Helper to convert Float32Array to Int16Array (16-bit PCM)
  const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output.buffer;
  };

  const startRecording = useCallback(async () => {
    try {
      setStatus("requesting");
      setError(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      // We use ScriptProcessorNode for simple PCM extraction
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);
      processorRef.current = processor;

      const data = new Uint8Array(analyser.frequencyBinCount);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Update visualization
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setDecibels(Math.round(avg));

        // Stream PCM chunk
        if (onAudioChunk) {
          const pcmBuffer = floatTo16BitPCM(inputData);
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(pcmBuffer))
          );
          onAudioChunk(base64);
        }
      };

      setStatus("recording");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setError(msg);
      setStatus("error");
    }
  }, [onAudioChunk]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStatus("idle");
    setDecibels(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    status,
    error,
    decibels,
    isRecording: status === "recording",
    startRecording,
    stopRecording,
  };
}
