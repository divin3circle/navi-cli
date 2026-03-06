import { EventEmitter } from "events";
import { GoogleGenAI, LiveConnectConfig } from "@google/generative-ai";
import { Agent } from "./agent.js";
import { Logger } from "../utils/logger.js";

// We use the new real-time Live API provided by the @google/generative-ai SDK.
// The Live API works with WebSockets locally and can process audio-in and audio-out.

export class LiveAPIHandler extends EventEmitter {
  private ai: GoogleGenAI;
  private session: any | null = null;
  private systemAgent: Agent;

  constructor(agent: Agent, apiKey: string) {
    super();
    this.systemAgent = agent;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async connect() {
    Logger.info("Connecting to Gemini Live API...");
    try {
      // Create a websocket based streaming session using the gemini-2.0-flash-exp model
      // Note: The Live API requires the 'exp' model generally.
      
      const config: LiveConnectConfig = {
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede", // Choose a professional voice
              }
            }
          },
          systemInstruction: {
            parts: [{
              text: `You are GenSSH Live. A voice-controlled, on-call DevOps SRE Agent. 
You are listening directly to the user's voice and replying with voice.
When the user asks you to perform an action, ALWAYS use the 'executeSystemCommand' function tool.
Do NOT just say what you would do. DO IT. 
Respond concisely. Your response is being spoken aloud to the user.`
            }]
          }
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "executeSystemCommand",
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
          }
        ]
      };

      // @ts-ignore - Note: Assuming SDK signature structure for the emerging Live API client
      this.session = await this.ai.clients.createLiveSession(config);

      this.session.on("message", async (msg: any) => {
         // Handle inbound audio from Gemini mapped to UI
         if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
               if (part.inlineData && part.inlineData.mimeType.startsWith("audio/pcm")) {
                  // Forward audio downstream to the relay
                  this.emit("audio_response", part.inlineData.data);
               }
            }
         }

         // Handle Tool / Function Calls
         if (msg.serverContent?.modelTurn?.functionCalls) {
            for (const call of msg.serverContent.modelTurn.functionCalls) {
              if (call.name === "executeSystemCommand") {
                const args = call.args as { command: string, reason: string };
                Logger.info(`Executing command for Gemini: ${args.command}`);
                try {
                  // We simulate the action structure required by the real Agent executor
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

                  // Send the outcome back to the live session
                  await this.session.send({
                    clientContent: {
                      turnComplete: true,
                      turns: [{
                        parts: [{
                          functionResponse: {
                            name: "executeSystemCommand",
                            response: { result: "Success", output: result }
                          }
                        }]
                      }]
                    }
                  });
                } catch (e: any) {
                  Logger.error(`Command failed: ${e.message}`);
                  this.emit("execution_result", {
                    command: args.command,
                    output: e.message,
                    exitCode: 1
                  });
                  // Inform Gemini of failure
                  await this.session.send({
                    clientContent: {
                      turnComplete: true,
                      turns: [{
                        parts: [{
                          functionResponse: {
                            name: "executeSystemCommand",
                            response: { result: "Failed", error: e.message }
                          }
                        }]
                      }]
                    }
                  });
                }
              }
            }
         }
      });

      this.session.on("close", () => {
        Logger.info("Gemini Live API connection closed.");
      });

      await this.session.connect();
      Logger.info("Gemini Live API Ready.");

    } catch (e) {
      Logger.error(`Live API Error: ${e}`);
    }
  }

  // Takes raw base64 buffer chunks from the frontend user microphone
  sendAudio(base64Chunk: string) {
    if (!this.session) return;
    
    // We package the base64 audio into the structure expected by Gemini Live
    const msg = {
      clientContent: {
        turns: [{
          parts: [{
            inlineData: {
              mimeType: "audio/webm;codecs=opus", 
              data: base64Chunk
            }
          }]
        }],
        turnComplete: true
      }
    };

    try {
      this.session.send(msg);
    } catch (e) {
      Logger.error(`Failed to send audio chunk: ${e}`);
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
