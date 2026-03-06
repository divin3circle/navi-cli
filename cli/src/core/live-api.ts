import { EventEmitter } from "events";
// @ts-ignore
import WebSocket from "ws";
import { Agent } from "./Agent.js";
import { Logger } from "../utils/logger.js";

/**
 * Direct WebSocket implementation for the Gemini Multimodal Live API.
 * Uses snake_case as required by the v1beta wire protocol for raw WS.
 */
export class LiveAPIHandler extends EventEmitter {
  private ws: WebSocket | null = null;
  private systemAgent: Agent;
  private apiKey: string;

  constructor(agent: Agent, apiKey: string) {
    super();
    this.systemAgent = agent;
    this.apiKey = apiKey;
  }

  async connect() {
    if (this.ws) return;

    // v1beta Multimodal Live Endpoint
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.MultimodalLive?key=${this.apiKey}`;
    
    Logger.info("Connecting to Gemini Multimodal Live API...");
    
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      Logger.info("Gemini WebSocket opened. Sending setup handshake...");
      
      const setupMsg = {
        setup: {
          model: "models/gemini-2.0-flash-exp",
          generation_config: {
            response_modalities: ["audio"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Aoede", 
                }
              }
            }
          },
          system_instruction: {
            parts: [{
              text: `You are GenSSH Live. A voice-controlled, on-call DevOps SRE Agent. 
You are listening directly to the user's voice and replying with voice.
When the user asks you to perform an action, ALWAYS use the 'execute_system_command' function tool.
Do NOT just say what you would do. DO IT. 
Respond concisely. Your response is being spoken aloud to the user.`
            }]
          },
          tools: [{
            function_declarations: [
              {
                name: "execute_system_command",
                description: "Executes a shell command on the user's server.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    command: {
                      type: "STRING",
                      description: "The exact shell command to execute."
                    },
                    reason: {
                      type: "STRING",
                      description: "A short explanation of why you are running this command."
                    }
                  },
                  required: ["command", "reason"]
                }
              }
            ]
          }]
        }
      };

      this.ws?.send(JSON.stringify(setupMsg));
    });

    this.ws.on("message", async (data: any) => {
      try {
        const msg = JSON.parse(data.toString());

        // 1. Handshake Result
        if (msg.setup_complete || msg.setupComplete) {
          Logger.info("Gemini Live Session AUTHENTICATED & READY.");
          this.emit("ready");
          return;
        }

        // 2. Error Handling
        const serverError = msg.server_content?.error || msg.serverContent?.error;
        if (serverError) {
          Logger.error(`Gemini Server Error: ${JSON.stringify(serverError)}`);
          return;
        }

        // 3. Audio/Text Content
        const modelTurn = msg.server_content?.model_turn || msg.serverContent?.modelTurn;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            const inlineData = part.inline_data || part.inlineData;
            if (inlineData?.mime_type?.startsWith("audio/pcm") || inlineData?.mimeType?.startsWith("audio/pcm")) {
              this.emit("audio_response", inlineData.data);
            }
            if (part.text) {
              this.emit("text_response", part.text);
            }
          }
        }

        // 4. Tool Calls
        if (modelTurn?.function_calls || modelTurn?.functionCalls) {
          const calls = modelTurn.function_calls || modelTurn.functionCalls;
          for (const call of calls) {
            if (call.name === "execute_system_command") {
              const args = call.args as { command: string; reason: string };
              Logger.info(`⚙ Gemini Executing: ${args.command}`);
              
              try {
                const result = await this.systemAgent.executeAction({
                  type: "command",
                  description: args.reason,
                  command: args.command
                });

                this.emit("execution_result", {
                  command: args.command,
                  output: result,
                  exitCode: 0 
                });

                // Send tool result back (snake_case)
                this.ws?.send(JSON.stringify({
                  tool_response: {
                    function_responses: [{
                      name: "execute_system_command",
                      id: call.id,
                      response: { result: "Success", output: result }
                    }]
                  }
                }));
              } catch (e: any) {
                Logger.error(`Command execution failed: ${e.message}`);
                this.emit("execution_result", {
                  command: args.command,
                  output: e.message,
                  exitCode: 1
                });
                this.ws?.send(JSON.stringify({
                  tool_response: {
                    function_responses: [{
                      name: "execute_system_command",
                      id: call.id,
                      response: { result: "Failed", error: e.message }
                    }]
                  }
                }));
              }
            }
          }
        }

        // 5. Interruption (Barge-in)
        const interrupted = msg.server_content?.interrupted || msg.serverContent?.interrupted;
        if (interrupted) {
          Logger.info("Gemini interrupted by user speech.");
          this.emit("interrupted");
        }

      } catch (err) {
        Logger.error(`Failed to process Gemini message: ${err}`);
      }
    });

    this.ws.on("error", (err: any) => {
      Logger.error(`Gemini WebSocket Connection Error: ${err.message}`);
      this.ws = null;
    });

    this.ws.on("close", (code: number, reason: string) => {
      Logger.info(`Gemini Session Closed (${code}): ${reason}`);
      this.ws = null;
      this.emit("close");
    });
  }

  sendAudio(base64Chunk: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // v1beta realtime_input mapping
    const msg = {
      realtime_input: {
        media_chunks: [{
          mime_type: "audio/pcm;rate=24000",
          data: base64Chunk
        }]
      }
    };

    try {
      this.ws.send(JSON.stringify(msg));
    } catch (e) {
      Logger.error(`Failed to send audio to Gemini: ${e}`);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
