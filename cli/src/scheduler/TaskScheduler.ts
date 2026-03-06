import cron from "node-cron";
import Database from "better-sqlite3";
import { Agent } from "../core/Agent.js";
import { Identity } from "../core/Identity.js";
import { Logger } from "../utils/logger.js";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

export interface ScheduledTask {
  id: string;
  taskType: "cron" | "once";
  cronExpression?: string; // For cron: '0 8 * * *'
  runAt?: Date; // For once: specific datetime
  taskDescription: string; // What to do: "check disk usage"
  abilityName?: string; // Optional: specific ability to run
  enabled: boolean;
  createdAt: Date;
  lastRun?: Date;
  telegramChatId?: number; // To notify user when task runs
}

/**
 * Unified task scheduler for cron jobs and one-time delayed tasks.
 * Runs inside the daemon process and executes tasks via the Agent.
 */
export class TaskScheduler {
  private db: Database.Database;
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  private agent: Agent | null = null;
  private onTaskResult?: (chatId: number, result: string) => void;

  private static MAX_STALENESS_MS = 24 * 60 * 60 * 1000;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initDatabase();
  }

  /**
   * Initialize the database schema
   */
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        cron_expression TEXT,
        run_at TEXT,
        task_description TEXT NOT NULL,
        ability_name TEXT,
        enabled INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        last_run TEXT,
        telegram_chat_id INTEGER
      )
    `);
  }

  /**
   * Set the callback for notifying users of task results (e.g., via Telegram)
   */
  setResultCallback(callback: (chatId: number, result: string) => void): void {
    this.onTaskResult = callback;
  }

  /**
   * Start the scheduler - loads all tasks from DB and schedules them
   */
  async start(): Promise<void> {
    // Initialize Agent
    const identity = await Identity.load();
    this.agent = new Agent(identity);
    this.agent.plainTextMode = true; // For Telegram notifications
    await this.agent.initialize();

    const tasks = this.listTasks().filter((t) => t.enabled);

    for (const task of tasks) {
      if (task.taskType === "cron" && task.cronExpression) {
        this.scheduleCronJob(task);
      } else if (task.taskType === "once" && task.runAt) {
        this.scheduleOnceTask(task);
      }
    }

    Logger.info(`TaskScheduler started with ${tasks.length} tasks`);
  }

  /**
   * Add a recurring cron job
   */
  addCronJob(
    cronExpression: string,
    taskDescription: string,
    abilityName?: string,
    telegramChatId?: number,
  ): ScheduledTask {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const task: ScheduledTask = {
      id: randomUUID(),
      taskType: "cron",
      cronExpression,
      taskDescription,
      abilityName,
      enabled: true,
      createdAt: new Date(),
      telegramChatId,
    };

    this.saveTask(task);
    this.scheduleCronJob(task);

    Logger.info(`Added cron job: ${task.id} - ${cronExpression}`);
    return task;
  }

  /**
   * Add a one-time delayed task
   */
  addOnceTask(
    runAt: Date,
    taskDescription: string,
    abilityName?: string,
    telegramChatId?: number,
  ): ScheduledTask {
    const task: ScheduledTask = {
      id: randomUUID(),
      taskType: "once",
      runAt,
      taskDescription,
      abilityName,
      enabled: true,
      createdAt: new Date(),
      telegramChatId,
    };

    this.saveTask(task);
    this.scheduleOnceTask(task);

    Logger.info(
      `Added one-time task: ${task.id} - runs at ${runAt.toISOString()}`,
    );
    return task;
  }

  /**
   * Schedule a cron job with node-cron
   */
  private scheduleCronJob(task: ScheduledTask): void {
    if (!task.cronExpression) return;

    const job = cron.schedule(task.cronExpression, async () => {
      await this.executeTask(task);
    });

    this.cronJobs.set(task.id, job);
  }

  /**
   * Schedule a one-time task with setTimeout
   */
  private scheduleOnceTask(task: ScheduledTask): void {
    if (!task.runAt) return;

    const now = Date.now();
    const runTime = new Date(task.runAt).getTime();
    const delay = runTime - now;

    if (delay <= 0) {
      const staleness = now - runTime;

      if (staleness > TaskScheduler.MAX_STALENESS_MS) {
        Logger.warn(
          `Task ${task.id} was scheduled for ${task.runAt} but is too stale. Skipping.`,
        );
        this.removeTask(task.id);
        return;
      }

      Logger.info(
        `Task ${task.id} was scheduled for ${task.runAt}, running now (${Math.round(staleness / 1000)}s late)`,
      );
      this.executeTask(task);
    } else {
      const timeout = setTimeout(async () => {
        await this.executeTask(task);
        this.timeouts.delete(task.id);
        this.removeTask(task.id);
      }, delay);

      this.timeouts.set(task.id, timeout);
    }
  }

  /**
   * Execute a task using the Agent
   */
  private async executeTask(task: ScheduledTask): Promise<void> {
    if (!this.agent) {
      Logger.error("Agent not initialized - cannot execute task");
      return;
    }

    Logger.info(`Executing task: ${task.id} - "${task.taskDescription}"`);

    try {
      const response = await this.agent.processMessage(task.taskDescription);

      let result = response.content;

      if (response.action && !response.requiresApproval) {
        const actionResult = await this.agent.executeAction(response.action);
        result += "\n\n" + actionResult;
      }

      this.updateLastRun(task.id);

      if (this.onTaskResult && task.telegramChatId) {
        this.onTaskResult(
          task.telegramChatId,
          `⏰ Scheduled Task Complete\n\n${result}`,
        );
      }

      Logger.info(`Task ${task.id} completed successfully`);
    } catch (error: any) {
      Logger.error(`Task ${task.id} failed: ${error.message}`);

      if (this.onTaskResult && task.telegramChatId) {
        this.onTaskResult(
          task.telegramChatId,
          `❌ Scheduled Task Failed\n\nTask: ${task.taskDescription}\nError: ${error.message}`,
        );
      }
    }
  }

  /**
   * List all tasks
   */
  listTasks(): ScheduledTask[] {
    const rows = this.db
      .prepare("SELECT * FROM scheduled_tasks")
      .all() as any[];
    return rows.map((row) => this.rowToTask(row));
  }

  /**
   * Remove a task
   */
  removeTask(id: string): void {
    const cronJob = this.cronJobs.get(id);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(id);
    }
    const timeout = this.timeouts.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(id);
    }

    this.db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
    Logger.info(`Removed task: ${id}`);
  }

  /**
   * Save task to database
   */
  private saveTask(task: ScheduledTask): void {
    this.db
      .prepare(
        `
      INSERT INTO scheduled_tasks (id, task_type, cron_expression, run_at, task_description, ability_name, enabled, created_at, telegram_chat_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        task.id,
        task.taskType,
        task.cronExpression || null,
        task.runAt?.toISOString() || null,
        task.taskDescription,
        task.abilityName || null,
        task.enabled ? 1 : 0,
        task.createdAt.toISOString(),
        task.telegramChatId || null,
      );
  }

  /**
   * Update last run time
   */
  private updateLastRun(id: string): void {
    this.db
      .prepare("UPDATE scheduled_tasks SET last_run = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
  }

  /**
   * Convert database row to ScheduledTask
   */
  private rowToTask(row: any): ScheduledTask {
    return {
      id: row.id,
      taskType: row.task_type,
      cronExpression: row.cron_expression,
      runAt: row.run_at ? new Date(row.run_at) : undefined,
      taskDescription: row.task_description,
      abilityName: row.ability_name,
      enabled: Boolean(row.enabled),
      createdAt: new Date(row.created_at),
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
      telegramChatId: row.telegram_chat_id,
    };
  }

  /**
   * Stop all scheduled tasks (for graceful shutdown)
   */
  stop(): void {
    for (const job of this.cronJobs.values()) {
      job.stop();
    }
    for (const timeout of this.timeouts.values()) {
      clearTimeout(timeout);
    }
    this.cronJobs.clear();
    this.timeouts.clear();
    Logger.info("TaskScheduler stopped");
  }
}
