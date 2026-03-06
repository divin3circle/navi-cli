import { z } from "zod";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { configManager } from "../../config/ConfigManager";
import { Agent as GeminiAgent } from "../../core/Agent.js";
import { LiveAPIHandler } from "../../core/live-api.js";
import { intro, spinner, note } from "@clack/prompts";
import chalk from "chalk";
import path from "path";

// When run from the root of the monorepo via bun:
const publicPath = path.join(process.cwd(), "apps", "cli", "public");

const RelayMessageSchema = z.object({
  type: z.enum(["ping", "audio_chunk", "text_command", "handshake_ack", "peer_connected", "peer_disconnected", "handshake", "audio_response", "execution_result", "pong", "error"]),
  payload: z.any().optional(),
});

export async function liveCommand() {
  intro(chalk.bgBlue.white.bold(" GenSSH Live Mode "));

  const s = spinner();
  s.start("Initializing Local Voice Command Center...");

  const config = configManager.getConfig();
  if (!config.apiKey) {
    s.stop("Failed to start Live Mode");
    console.error(chalk.red("Error: Gemini API key not found. Run 'genssh init' first."));
    process.exit(1);
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  
  // Initialize AI Agent
  const agent = new GeminiAgent(config.apiKey);
  const liveHandler = new LiveAPIHandler(agent, config.apiKey);
  let activeSocket: any = null;

  const app = new Hono();

  // Route: Static Frontend App (Auth/Connect/Dashboard)
  app.use("/*", serveStatic({ root: "./public" })); 

  // Create the native Bun server wrapping Hono
  // @ts-ignore: Bun is globally available but lacks types dynamically here until user installs 
  const server = Bun.serve({
    port: PORT,
    fetch(req: any, server: any) {
      if (req.url.includes("/ws") || req.headers.get("upgrade") === "websocket") {
        const upgraded = server.upgrade(req);
        if (upgraded) return;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return app.fetch(req);
    },
    websocket: {
      open(ws: any) {
        console.log(chalk.dim("[Dashboard] Browser connection opened"));
        activeSocket = ws;
      },
      async message(ws: any, message: any) {
        let msg: any;
        try {
          msg = JSON.parse(message as string);
        } catch { return; }

        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        }
        else if (msg.type === "handshake") {
          ws.send(JSON.stringify({
            type: "handshake_ack",
            clientId: "local-dashboard",
            userId: msg.userId || "local",
            agentOnline: true,
            dashboardOnline: true,
          }));
          // Connect the AI backend eagerly when UI spins up
          await liveHandler.connect();
          console.log(chalk.blue("ℹ Dashboard interface authed. Audio stream ready."));
        }
        else if (msg.type === "audio_chunk") {
          // Push browser mic audio straight to Gemini
          liveHandler.sendAudio(msg.payload.audioBase64);
        }
      },
      close(ws: any) {
        console.log(chalk.yellow("⚠ Dashboard disconnected."));
        if (activeSocket === ws) activeSocket = null;
        liveHandler.disconnect();
      }
    }
  });

  // Bind Outbound AI Events to the active browser dashboard
  liveHandler.on("audio_response", (base64Audio: string) => {
    if (activeSocket) {
      activeSocket.send(JSON.stringify({
        type: "audio_response",
        payload: { audioBase64: base64Audio }
      }));
    }
  });

  liveHandler.on("execution_result", (result: any) => {
    console.log(chalk.magenta(`⚙ Executed: ${result.command}`));
    if (activeSocket) {
      activeSocket.send(JSON.stringify({
        type: "execution_result",
        payload: result
      }));
    }
  });

  s.stop("Local Command Center Active");
  
  note(
    `1. Dash Server: http://localhost:${PORT}\n` +
    `2. WebSockets:  ws://localhost:${PORT}\n\n` +
    `Open the Dash Server in your browser to begin.`,
    "Ready"
  );

  process.on("SIGINT", () => {
    console.log(chalk.dim("\nShutting down GenSSH Live..."));
    server.stop(true);
    liveHandler.disconnect();
    process.exit(0);
  });
}
