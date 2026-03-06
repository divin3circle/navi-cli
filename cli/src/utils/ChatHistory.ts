import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";

export interface ChatMessage {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  requiresApproval?: boolean;
  action?: any;
}

export interface ChatSession {
  startedAt: Date;
  lastActiveAt: Date;
  messages: ChatMessage[];
}

/**
 * Manages persistent chat history storage
 */
export class ChatHistory {
  private static HISTORY_DIR = join(homedir(), ".genssh", "history");
  private static HISTORY_FILE = join(ChatHistory.HISTORY_DIR, "chat.json");
  private static MAX_MESSAGES = 100; // Keep last 100 messages

  /**
   * Ensure history directory exists
   */
  private static async ensureHistoryDir(): Promise<void> {
    if (!existsSync(ChatHistory.HISTORY_DIR)) {
      await mkdir(ChatHistory.HISTORY_DIR, { recursive: true });
    }
  }

  /**
   * Load chat history
   */
  static async load(): Promise<ChatMessage[]> {
    await ChatHistory.ensureHistoryDir();

    if (!existsSync(ChatHistory.HISTORY_FILE)) {
      return [];
    }

    try {
      const content = await readFile(ChatHistory.HISTORY_FILE, "utf-8");
      const session: ChatSession = JSON.parse(content);

      // Convert timestamp strings back to Date objects
      return session.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    } catch (error) {
      // If file is corrupted, start fresh
      return [];
    }
  }

  /**
   * Save chat history
   */
  static async save(messages: ChatMessage[]): Promise<void> {
    await ChatHistory.ensureHistoryDir();

    // Only keep the last MAX_MESSAGES
    const messagesToSave = messages.slice(-ChatHistory.MAX_MESSAGES);

    const session: ChatSession = {
      startedAt: messagesToSave[0]?.timestamp || new Date(),
      lastActiveAt: new Date(),
      messages: messagesToSave,
    };

    await writeFile(
      ChatHistory.HISTORY_FILE,
      JSON.stringify(session, null, 2),
      "utf-8",
    );
  }

  /**
   * Clear chat history
   */
  static async clear(): Promise<void> {
    if (existsSync(ChatHistory.HISTORY_FILE)) {
      const { unlink } = await import("fs/promises");
      await unlink(ChatHistory.HISTORY_FILE);
    }
  }

  /**
   * Get conversation context for AI (last N messages)
   */
  static getContext(messages: ChatMessage[], count: number = 10): string {
    const recentMessages = messages.slice(-count);
    return recentMessages
      .filter((msg) => msg.role !== "system")
      .map((msg) => `${msg.role === "user" ? "User" : "Agent"}: ${msg.content}`)
      .join("\n");
  }
}
