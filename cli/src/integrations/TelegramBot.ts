import { Telegraf, Context, Markup } from "telegraf";
import { Identity } from "../core/Identity.js";
import { Agent } from "../core/Agent.js";
import { ConfigManager } from "../config/ConfigManager.js";
import { Logger } from "../utils/logger.js";
import { TelegramHistory } from "../utils/TelegramHistory.js";

// Helper to strip ANSI codes for Telegram (since Telegram doesn't support them)
function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}

export class TelegramBot {
  private bot: Telegraf;
  private config: ConfigManager;
  private identity: Identity | null = null;
  private agent: Agent | null = null;
  private allowedUserId: string | null = null;
  private pendingActions = new Map<number, any>();

  constructor() {
    this.config = new ConfigManager();
    const ownerId = this.config.get("telegramOwnerId");
    this.allowedUserId = typeof ownerId === "string" ? ownerId : null;
    this.bot = null as any;
  }

  /**
   * Initialize and start the bot
   */
  async start() {
    const token = await this.config.getEncrypted("telegramBotToken");

    if (!token) {
      throw new Error(
        "Telegram Bot Token not found. Run 'genssh telegram setup' first.",
      );
    }

    this.bot = new Telegraf(token);

    this.identity = await Identity.load();
    this.agent = new Agent(this.identity);
    this.agent.plainTextMode = true; // Telegram needs plain text, not Markdown
    await this.agent.initialize();

    // Security Middleware
    this.bot.use(async (ctx, next) => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();

      // If no owner set, help them set it (Security risk if left open, but needed for setup?)
      // Actually, setup command should handle this. Here we block.
      if (this.allowedUserId && userId !== this.allowedUserId) {
        Logger.warn(
          `Unauthorized access attempt from ID: ${userId} (@${ctx.from.username})`,
        );
        return; // Silent ignore
      }

      await next();
    });

    // Start Command
    this.bot.command("start", (ctx) => {
      ctx.reply(
        `👋 Beep Boop! I am ${this.identity?.data.agent.name}. running on ${this.identity?.data.server.hostname}.\n\nI am ready to help you manage this server.`,
      );
    });

    // Handle Text Messages
    this.bot.on("text", async (ctx) => {
      // Show typing indicator
      ctx.sendChatAction("typing");

      const userMessage = ctx.message.text;
      const userId = ctx.from.id.toString();

      try {
        if (!this.agent) return;

        // Load chat history for this user
        const history = await TelegramHistory.load(userId);

        // Add user message to history
        history.push({
          role: "user",
          content: userMessage,
          timestamp: new Date(),
        });

        // Get context for AI (last 10 messages)
        const context = TelegramHistory.getContext(history, 10);

        const response = await this.agent.processMessage(userMessage, context);

        // Add agent response to history
        history.push({
          role: "agent",
          content: response.content,
          timestamp: new Date(),
        });

        // Save updated history
        await TelegramHistory.save(userId, history);

        // Send the main response
        const cleanContent = stripAnsi(response.content);
        await ctx.reply(cleanContent);

        if (response.action) {
          if (response.requiresApproval) {
            await ctx.reply(
              `⚠️ **Approval Required**\n\nI want to execution action: \`${response.action.type}\``,
              Markup.inlineKeyboard([
                Markup.button.callback("✅ Approve", "approve_action"),
                Markup.button.callback("❌ Deny", "deny_action"),
              ]),
            );

            this.pendingActions.set(ctx.chat.id, response.action);
          } else {
            await this.executeAndReply(ctx, response.action);
          }
        }
      } catch (error: any) {
        ctx.reply(`❌ Error: ${error.message}`);
      }
    });

    // Handle Callbacks (Buttons)
    this.bot.action("approve_action", async (ctx) => {
      if (!ctx.chat) return;

      const action = this.pendingActions.get(ctx.chat.id);

      if (action) {
        ctx.answerCbQuery("Approving...");
        ctx.editMessageText("✅ Action Approved. Executing...");
        this.pendingActions.delete(ctx.chat.id);
        await this.executeAndReply(ctx, action);
      } else {
        ctx.answerCbQuery("No pending action");
        ctx.editMessageText("⚠️ Session expired or no action pending.");
      }
    });

    this.bot.action("deny_action", async (ctx) => {
      if (!ctx.chat) return;
      this.pendingActions.delete(ctx.chat.id);
      ctx.answerCbQuery("Cancelled");
      ctx.editMessageText("🚫 Action Cancelled.");
    });

    Logger.info("Telegram Bot started...");
    this.bot.launch();

    // Graceful stop
    process.once("SIGINT", () => this.bot.stop("SIGINT"));
    process.once("SIGTERM", () => this.bot.stop("SIGTERM"));
  }

  // Scheduler instance to manage tasks
  private scheduler?: any;

  /**
   * Set the scheduler instance
   */
  setScheduler(scheduler: any) {
    this.scheduler = scheduler;
  }

  private async executeAndReply(ctx: any, action: any) {
    if (!this.agent) return;

    // Handle schedule action
    if (action.type === "schedule" && action.schedule) {
      if (!this.scheduler) {
        await ctx.reply(
          "❌ Scheduler is not active in this mode. Run 'genssh start' to enable scheduling.",
        );
        return;
      }

      const sched = action.schedule;
      const chatId = ctx.chat?.id;

      try {
        if (sched.type === "cron" && sched.cronExpression) {
          this.scheduler.addCronJob(
            sched.cronExpression,
            sched.taskDescription,
            undefined,
            chatId,
          );
          await ctx.reply(
            `✅ Cron Job Created!\n\nSchedule: \`${sched.cronExpression}\`\nTask: ${sched.taskDescription}`,
          );
        } else if (sched.type === "once" && sched.delayMinutes) {
          const runAt = new Date(Date.now() + sched.delayMinutes * 60000);
          this.scheduler.addOnceTask(
            runAt,
            sched.taskDescription,
            undefined,
            chatId,
          );
          await ctx.reply(
            `✅ One-Time Task Scheduled!\n\nRun At: ${runAt.toLocaleTimeString()}\nTask: ${sched.taskDescription}`,
          );
        }
      } catch (error: any) {
        await ctx.reply(`❌ Failed to schedule task: ${error.message}`);
      }
      return;
    }

    ctx.sendChatAction("typing");
    const msg = await ctx.reply("Wait a sec...");

    try {
      const result = await this.agent.executeAction(action);
      const cleanResult = stripAnsi(result);

      // Split long messages if needed (Telegram limit 4096)
      if (cleanResult.length > 4000) {
        const chunks = cleanResult.match(/.{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          msg.message_id,
          undefined,
          cleanResult,
        );
      }
    } catch (error: any) {
      await ctx.reply(`Execution failed: ${error.message}`);
    }
  }

  /**
   * Send a message to a specific chat (used by scheduler)
   */
  async sendMessage(chatId: number, message: string): Promise<void> {
    if (!this.bot) {
      Logger.error("Bot not initialized - cannot send message");
      return;
    }

    try {
      await this.bot.telegram.sendMessage(chatId, message);
    } catch (error: any) {
      Logger.error(`Failed to send message to ${chatId}: ${error.message}`);
    }
  }
}
