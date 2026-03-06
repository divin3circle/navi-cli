import cron from 'node-cron';
import Database from 'better-sqlite3';
import { GeminiClient } from '../core/GeminiClient.js';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  abilityName?: string;
  enabled: boolean;
  createdAt: Date;
  lastRun?: Date;
}

/**
 * Cron job manager with natural language parsing
 */
export class CronManager {
  private db: Database.Database;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private _gemini: GeminiClient;

  constructor(dbPath: string, geminiClient: GeminiClient) {
    this.db = new Database(dbPath);
    this._gemini = geminiClient;
    this.initDatabase();
  }

  /**
   * Initialize the database
   */
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        schedule TEXT NOT NULL,
        command TEXT NOT NULL,
        ability_name TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_run TEXT
      )
    `);
  }

  /**
   * Create a cron job from natural language
   */
  async createFromNaturalLanguage(_request: string): Promise<CronJob> {
    // TODO: Implement natural language parsing with Gemini
    // TODO: Validate cron expression
    // TODO: Save to database
    // TODO: Schedule the job
    throw new Error('Cron job creation not yet implemented');
  }

  /**
   * List all cron jobs
   */
  listJobs(): CronJob[] {
    const rows = this.db.prepare('SELECT * FROM cron_jobs').all() as any[];
    return rows.map(row => this.rowToJob(row));
  }

  /**
   * Remove a cron job
   */
  removeJob(id: string): void {
    const task = this.jobs.get(id);
    if (task) {
      task.stop();
      this.jobs.delete(id);
    }

    this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
  }

  /**
   * Convert database row to CronJob
   */
  private rowToJob(row: any): CronJob {
    return {
      id: row.id,
      name: row.name,
      schedule: row.schedule,
      command: row.command,
      abilityName: row.ability_name,
      enabled: Boolean(row.enabled),
      createdAt: new Date(row.created_at),
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
    };
  }
}
