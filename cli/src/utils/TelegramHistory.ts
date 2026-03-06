import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

interface TelegramMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
}

/**
 * Manages persistent chat history for Telegram conversations.
 * Stores history per-user to maintain context across sessions.
 */
export class TelegramHistory {
  private static HISTORY_DIR = join(homedir(), '.genssh', 'telegram');

  private static getHistoryPath(userId: string): string {
    return join(this.HISTORY_DIR, `${userId}.json`);
  }

  /**
   * Load chat history for a specific Telegram user
   */
  static async load(userId: string): Promise<TelegramMessage[]> {
    const historyPath = this.getHistoryPath(userId);

    try {
      if (!existsSync(historyPath)) {
        return [];
      }

      const data = await readFile(historyPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Convert timestamp strings back to Date objects
      return parsed.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Save chat history for a specific Telegram user
   */
  static async save(userId: string, messages: TelegramMessage[]): Promise<void> {
    // Ensure directory exists
    if (!existsSync(this.HISTORY_DIR)) {
      await mkdir(this.HISTORY_DIR, { recursive: true });
    }

    const historyPath = this.getHistoryPath(userId);

    // Keep only the last 50 messages to prevent file bloat
    const trimmedMessages = messages.slice(-50);

    await writeFile(historyPath, JSON.stringify(trimmedMessages, null, 2), 'utf-8');
  }

  /**
   * Get context string for AI (last N messages)
   */
  static getContext(messages: TelegramMessage[], limit: number = 10): string {
    const recent = messages.slice(-limit);
    return recent
      .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
      .join('\n');
  }

  /**
   * Clear history for a specific user
   */
  static async clear(userId: string): Promise<void> {
    const historyPath = this.getHistoryPath(userId);
    try {
      if (existsSync(historyPath)) {
        await writeFile(historyPath, '[]', 'utf-8');
      }
    } catch {
      // Ignore errors
    }
  }
}
