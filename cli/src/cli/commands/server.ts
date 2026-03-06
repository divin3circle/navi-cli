import { TelegramBot } from "../../integrations/TelegramBot.js";
import { TaskScheduler } from "../../scheduler/TaskScheduler.js";
import { Identity } from "../../core/Identity.js";
import { Logger } from "../../utils/logger.js";
import { join } from "path";
import { homedir } from "os";

export async function serverCommand() {
  console.log("Starting GenSSH Agent Server...");
  
  if (!Identity.isInitialized()) {
    console.error("❌ Not initialized. Run 'genssh init' first.");
    process.exit(1);
  }

  try {
    // Start Telegram Bot
    const bot = new TelegramBot();
    await bot.start();
    
    // Start Task Scheduler
    const dbPath = join(homedir(), '.genssh', 'tasks.db');
    const scheduler = new TaskScheduler(dbPath);
    
    // Connect bi-directionally
    bot.setScheduler(scheduler);
    scheduler.setResultCallback((chatId, result) => {
      bot.sendMessage(chatId, result);
    });
    
    await scheduler.start();
    
    console.log("✓ Agent is running");
    console.log("  - Telegram Bot: Active");
    console.log("  - Task Scheduler: Active");
    
    // Graceful shutdown
    process.once('SIGINT', () => {
      scheduler.stop();
      process.exit(0);
    });
    process.once('SIGTERM', () => {
      scheduler.stop();
      process.exit(0);
    });
    
  } catch (error: any) {
    Logger.error(`Server failed to start: ${error.message}`);
    process.exit(1);
  }
}
