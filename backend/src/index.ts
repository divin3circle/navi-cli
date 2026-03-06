import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

// ============================================================
// Types
// ============================================================

type ClientType = "dashboard" | "agent";

interface ConnectedClient {
  id: string;
  type: ClientType;
  userId: string;
  ws: WebSocketLike;
  connectedAt: Date;
}

interface WebSocketLike {
  send(data: string | Uint8Array): void;
  close(): void;
  readyState: number;
}

// Message schemas for type-safe relay
const HandshakeSchema = z.object({
  type: z.literal("handshake"),
  clientType: z.enum(["dashboard", "agent"]),
  userId: z.string().min(1),
  token: z.string().optional(), // Firebase ID token (dashboard) or agent secret (agent)
});

const RelayMessageSchema = z.object({
  type: z.enum(["audio_chunk", "text_command", "text_response", "audio_response", "execution_result", "ping", "pong"]),
  payload: z.unknown(),
});

type HandshakeMsg = z.infer<typeof HandshakeSchema>;
type RelayMsg = z.infer<typeof RelayMessageSchema>;

// ============================================================
// In-memory session store
// Maps userId -> { dashboard, agent }
// ============================================================
const sessions = new Map<string, {
  dashboard: ConnectedClient | null;
  agent: ConnectedClient | null;
}>();

function getOrCreateSession(userId: string) {
  if (!sessions.has(userId)) {
    sessions.set(userId, { dashboard: null, agent: null });
  }
  return sessions.get(userId)!;
}

function cleanupClient(client: ConnectedClient) {
  const session = sessions.get(client.userId);
  if (!session) return;

  if (session[client.type]?.id === client.id) {
    session[client.type] = null;
    console.log(`[Relay] ${client.type} disconnected  userId=${client.userId}`);
  }

  // Clean up empty sessions
  if (!session.dashboard && !session.agent) {
    sessions.delete(client.userId);
  }
}

function sendTo(client: ConnectedClient | null, msg: object) {
  if (!client || client.ws.readyState !== 1) return;
  try {
    client.ws.send(JSON.stringify(msg));
  } catch {
    // ignore stale connections
  }
}

// ============================================================
// Hono + Native Bun WebSocket Relay
// ============================================================
const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", sessions: sessions.size, ts: new Date().toISOString() })
);

app.get("/stats", (c) => {
  const stats: Record<string, { dashboard: boolean; agent: boolean }> = {};
  for (const [userId, session] of sessions) {
    stats[userId] = {
      dashboard: !!session.dashboard,
      agent: !!session.agent,
    };
  }
  return c.json(stats);
});

// ============================================================
// Native Bun WebSocket handler
// ============================================================
const PORT = Number(process.env.PORT) || 3001;

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade to WebSocket if requested
    if (req.headers.get("upgrade") === "websocket") {
      const upgraded = server.upgrade(req, { data: { connectedAt: new Date() } });
      if (upgraded) return;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Fall through to Hono for HTTP routes
    return app.fetch(req);
  },

  websocket: {
    open(ws) {
      // Assign a temp ID until we receive the handshake
      (ws as any)._tempId = uuidv4();
      console.log(`[Relay] New connection  tempId=${(ws as any)._tempId}`);
    },

    message(ws, rawMsg) {
      let msg: unknown;
      try {
        msg = JSON.parse(typeof rawMsg === "string" ? rawMsg : new TextDecoder().decode(rawMsg as ArrayBuffer));
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const existingClient = (ws as any)._client as ConnectedClient | undefined;

      // ── Handshake ──────────────────────────────────────
      if (!existingClient) {
        const parsed = HandshakeSchema.safeParse(msg);
        if (!parsed.success) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid handshake" }));
          ws.close();
          return;
        }

        const handshake: HandshakeMsg = parsed.data;
        const client: ConnectedClient = {
          id: uuidv4(),
          type: handshake.clientType,
          userId: handshake.userId,
          ws: ws as unknown as WebSocketLike,
          connectedAt: new Date(),
        };

        (ws as any)._client = client;
        const session = getOrCreateSession(handshake.userId);

        // Replace old connection if any
        const prev = session[handshake.clientType];
        if (prev) {
          sendTo(prev, { type: "evicted", message: "New connection established" });
          prev.ws.close();
        }

        session[handshake.clientType] = client;

        console.log(`[Relay] ${handshake.clientType} registered  userId=${handshake.userId} id=${client.id}`);

        ws.send(JSON.stringify({
          type: "handshake_ack",
          clientId: client.id,
          userId: client.userId,
          agentOnline: !!session.agent,
          dashboardOnline: !!session.dashboard,
        }));

        // Notify counterpart
        const other = handshake.clientType === "dashboard" ? session.agent : session.dashboard;
        if (other) {
          sendTo(other, {
            type: "peer_connected",
            peerType: handshake.clientType,
          });
        }
        return;
      }

      // ── Relay ───────────────────────────────────────────
      const parsed = RelayMessageSchema.safeParse(msg);
      if (!parsed.success) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }));
        return;
      }

      const relayMsg: RelayMsg = parsed.data;
      const session = sessions.get(existingClient.userId);
      if (!session) return;

      // Ping / Pong health check
      if (relayMsg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        return;
      }

      // Route to counterpart
      const target =
        existingClient.type === "dashboard" ? session.agent : session.dashboard;

      if (!target) {
        ws.send(JSON.stringify({ type: "error", message: "Peer not connected", peerType: existingClient.type === "dashboard" ? "agent" : "dashboard" }));
        return;
      }

      sendTo(target, relayMsg);
    },

    close(ws) {
      const client = (ws as any)._client as ConnectedClient | undefined;
      if (client) {
        cleanupClient(client);

        // Notify the other side
        const session = sessions.get(client.userId);
        const other =
          client.type === "dashboard" ? session?.agent : session?.dashboard;
        if (other) {
          sendTo(other, { type: "peer_disconnected", peerType: client.type });
        }
      }
    },
  },
});

console.log(`✅ GenSSH Relay Server running on ws://localhost:${PORT}`);
console.log(`   Health: http://localhost:${PORT}/health`);
console.log(`   Stats:  http://localhost:${PORT}/stats`);
