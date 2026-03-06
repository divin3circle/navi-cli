"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

type RelayMessage =
  | { type: "handshake_ack"; clientId: string; userId: string; agentOnline: boolean; dashboardOnline: boolean }
  | { type: "peer_connected"; peerType: "dashboard" | "agent" }
  | { type: "peer_disconnected"; peerType: "dashboard" | "agent" }
  | { type: "text_response"; payload: { text: string } }
  | { type: "audio_response"; payload: { audioBase64: string } }
  | { type: "execution_result"; payload: { command: string; output: string; exitCode: number } }
  | { type: "error"; message: string }
  | { type: "pong"; ts: number };

interface UseRelayOptions {
  relayUrl: string;
  userId: string;
  onMessage?: (msg: RelayMessage) => void;
  onAgentStatus?: (online: boolean) => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useRelay({ relayUrl, userId, onMessage, onAgentStatus }: UseRelayOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(relayUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) { ws.close(); return; }
      // Send handshake immediately
      ws.send(JSON.stringify({
        type: "handshake",
        clientType: "dashboard",
        userId,
      }));
    };

    ws.onmessage = (event) => {
      let msg: RelayMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "handshake_ack") {
        setStatus("connected");
        onAgentStatus?.(msg.agentOnline);
        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", payload: null }));
          }
        }, 25_000);
      } else if (msg.type === "peer_connected" && msg.peerType === "agent") {
        onAgentStatus?.(true);
      } else if (msg.type === "peer_disconnected" && msg.peerType === "agent") {
        onAgentStatus?.(false);
      }

      onMessage?.(msg);
    };

    ws.onerror = () => {
      setStatus("error");
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (!isMountedRef.current) return;
      setStatus("disconnected");
      // Auto-reconnect after 3s
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) connect();
      }, 3000);
    };
  }, [relayUrl, userId, onMessage, onAgentStatus]);

  const disconnect = useCallback(() => {
    isMountedRef.current = false;
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    wsRef.current?.close();
  }, []);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relayUrl, userId]);

  return { status, sendMessage, disconnect, reconnect: connect };
}
