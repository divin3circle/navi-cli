import { z } from "zod";
import { Hono } from "hono";
import { ConfigManager } from "../../config/ConfigManager.js";
import { Agent as GeminiAgent } from "../../core/Agent.js";
import { Identity } from "../../core/Identity.js";
import { LiveAPIHandler } from "../../core/live-api.js";
import { intro, spinner, note } from "@clack/prompts";
import chalk from "chalk";
import path from "path";
import fs from "fs";

// Resolve public path — works whether running from apps/cli/ or the monorepo root
const cwd = process.cwd();
const publicPath = fs.existsSync(`${cwd}/public`)
  ? `${cwd}/public`
  : `${cwd}/apps/cli/public`;

const RelayMessageSchema = z.object({
  type: z.enum(["ping", "audio_chunk", "text_command", "handshake_ack", "peer_connected", "peer_disconnected", "handshake", "audio_response", "text_response", "interrupted", "execution_result", "pong", "error"]),
  payload: z.any().optional(),
});

/** Serve an HTML file from the Next.js static export */
function serveHtml(filePath: string): Response {
  try {
    const html = fs.readFileSync(filePath, "utf-8");
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("404 Not Found", { status: 404 });
  }
}

/** Serve any asset (js, css, images) from the public folder */
function serveAsset(reqPath: string): Response | null {
  const filePath = path.join(publicPath, reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".js": "application/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".ttf": "font/ttf",
    };
    const mime = mimeTypes[ext] || "application/octet-stream";
    const file = fs.readFileSync(filePath);
    return new Response(file, { headers: { "Content-Type": mime } });
  }
  return null;
}

export async function liveCommand() {
  intro(chalk.bgBlue.white.bold(" GenSSH Live Mode "));

  const s = spinner();
  s.start("Initializing Local Voice Command Center...");

  const configManager = new ConfigManager();
  let apiKey: string;
  try {
    apiKey = await configManager.getEncrypted("geminiApiKey");
  } catch {
    s.stop("Failed to start Live Mode");
    console.error(chalk.red("Error: Gemini API key not found. Run 'genssh init' first."));
    process.exit(1);
  }

  if (!Identity.isInitialized()) {
    console.error(chalk.red("Error: Identity not found. Run 'genssh init' first."));
    process.exit(1);
  }
  const identity = await Identity.load();

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  
  // Initialize AI Agent
  const agent = new GeminiAgent(identity);
  await agent.initialize();

  const liveHandler = new LiveAPIHandler(agent, apiKey);
  let activeSocket: any = null;

  const app = new Hono();

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

      // Custom static file routing — handles Next.js static export structure
      const url = new URL(req.url);
      const reqPath = url.pathname;

      // Try serving a static asset file first (JS, CSS, images, etc.)
      const asset = serveAsset(reqPath);
      if (asset) return asset;

      // Route HTML pages matching the flat Next.js static export structure
      if (reqPath === "/" || reqPath === "/index.html") {
        return serveHtml(path.join(publicPath, "index.html"));
      }
      if (reqPath.startsWith("/connect")) {
        return serveHtml(path.join(publicPath, "connect.html"));
      }
      if (reqPath.startsWith("/dashboard")) {
        return serveHtml(path.join(publicPath, "dashboard.html"));
      }

      // Fallback — serve root index.html for any unmatched routes (SPA behavior)
      return serveHtml(path.join(publicPath, "index.html"));
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
          if (Math.random() < 1) { // Log every chunk for now to be sure
             console.log(chalk.dim(`[WS] Received audio chunk (${msg.payload.audioBase64?.length || 0} bytes)`));
          }
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

  liveHandler.on("text_response", (text: string) => {
    if (activeSocket) {
      activeSocket.send(JSON.stringify({
        type: "text_response",
        payload: { text }
      }));
    }
  });

  liveHandler.on("interrupted", () => {
    if (activeSocket) {
      activeSocket.send(JSON.stringify({
        type: "interrupted"
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
