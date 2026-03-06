import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Simple logger for GenSSH
 */
export class Logger {
  private static LOG_DIR = join(homedir(), '.genssh', 'logs');
  private static LOG_FILE = join(Logger.LOG_DIR, 'genssh.log');

  /**
   * Ensure log directory exists
   */
  private static async ensureLogDir(): Promise<void> {
    if (!existsSync(Logger.LOG_DIR)) {
      await mkdir(Logger.LOG_DIR, { recursive: true });
    }
  }

  /**
   * Write a log entry
   */
  private static async write(level: LogLevel, message: string, data?: any): Promise<void> {
    await Logger.ensureLogDir();

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
    };

    const logLine = `${JSON.stringify(logEntry)}\n`;
    await appendFile(Logger.LOG_FILE, logLine, 'utf-8');
  }

  /**
   * Log info message
   */
  static async info(message: string, data?: any): Promise<void> {
    await Logger.write('info', message, data);
    if (process.env.DEBUG) {
      console.log(`[INFO] ${message}`, data || '');
    }
  }

  /**
   * Log warning message
   */
  static async warn(message: string, data?: any): Promise<void> {
    await Logger.write('warn', message, data);
    if (process.env.DEBUG) {
      console.warn(`[WARN] ${message}`, data || '');
    }
  }

  /**
   * Log error message
   */
  static async error(message: string, error?: Error | any): Promise<void> {
    await Logger.write('error', message, {
      error: error?.message,
      stack: error?.stack,
    });
    if (process.env.DEBUG) {
      console.error(`[ERROR] ${message}`, error || '');
    }
  }

  /**
   * Log debug message
   */
  static async debug(message: string, data?: any): Promise<void> {
    if (process.env.DEBUG) {
      await Logger.write('debug', message, data);
      console.log(`[DEBUG] ${message}`, data || '');
    }
  }
}
