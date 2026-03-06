import * as clack from "@clack/prompts";
import { ConfigManager } from "../../config/ConfigManager.js";
import { Telegraf } from "telegraf";

export async function telegramSetupCommand() {
  console.clear();
  clack.intro("🤖 Telegram Integration Setup");

  const config = new ConfigManager();

  const token = await clack.password({
    message: "Enter your Telegram Bot Token (from @BotFather):",
    validate: (value) => {
      if (!value) return "Token is required";
      if (!value.includes(":")) return "Invalid token format";
      return undefined;
    },
  });

  if (clack.isCancel(token)) {
    clack.cancel("Setup cancelled");
    process.exit(0);
  }

  const bot = new Telegraf(token as string);

  const detectId = await clack.confirm({
    message:
      "Do you want to auto-detect your User ID? (You will need to send a message to the bot)",
    initialValue: true,
  });

  let userId = "";

  if (detectId && !clack.isCancel(detectId)) {
    const s = clack.spinner();
    s.start('Waiting for you to message the bot... (Send "hello" to it now)');

    try {
      await new Promise<void>((resolve, reject) => {
        let retries = 0;
        const poll = setInterval(async () => {
          try {
            // Get updates (dirty polling for setup only)
            // Note: This relies on the token being valid
            // In a real CLI we might need a timeout
            // For simplified logic:
            // We actually start the bot in a temp mode
          } catch (e) {
            // ignore
          }
          retries++;
          if (retries > 30) {
            clearInterval(poll);
            reject(new Error("Timeout waiting for message"));
          }
        }, 2000);

        // Easier way: Launch bot with a specific handler only for this setup
        bot.on("message", (ctx) => {
          if (ctx.from) {
            userId = ctx.from.id.toString();
            s.stop(`Check! Found User ID: ${userId} (${ctx.from.username})`);
            bot.stop();
            resolve();
          }
        });

        bot.launch().catch(() => {
          s.stop("Failed to connect to Telegram");
          reject(new Error("Connection failed"));
        });
      });
    } catch (e) {
      s.stop("Could not detect automatically.");
    }
  }

  if (!userId) {
    const manualId = await clack.text({
      message:
        "Enter your Telegram User ID manually (get it from @userinfobot):",
      validate: (value) => {
        if (!value) return "ID is required";
        return undefined;
      },
    });
    if (clack.isCancel(manualId)) process.exit(0);
    userId = manualId as string;
  }

  const s = clack.spinner();
  s.start("Saving configuration...");

  await config.setEncrypted("telegramBotToken", token as string);
  config.set("telegramOwnerId", userId);
  config.set("telegramEnabled", true);

  s.stop("Configuration saved!");

  const startNow = await clack.confirm({
    message: "Start the bot now?",
    initialValue: true,
  });

  if (startNow && !clack.isCancel(startNow)) {
    const { spawn, execSync } = await import("child_process");

    let pm2Available = false;
    try {
      execSync("pm2 --version", { stdio: "ignore" });
      pm2Available = true;
    } catch {
      pm2Available = false;
    }

    if (pm2Available) {
      const pm2Spinner = clack.spinner();
      pm2Spinner.start("Starting with PM2...");

      try {
        const gensshPath = process.argv[1];
        execSync(`pm2 start "node ${gensshPath} start" --name genssh-agent`, {
          stdio: "ignore",
        });

        pm2Spinner.stop("Bot started with PM2!");

        clack.note(
          `Your agent is running in PM2.\n\n` +
            `Useful commands:\n` +
            `  pm2 logs genssh-agent   View logs\n` +
            `  pm2 stop genssh-agent   Stop the bot\n` +
            `  pm2 restart genssh-agent Restart the bot\n` +
            `  pm2 save && pm2 startup  Auto-start on boot`,
        );
      } catch (error: any) {
        pm2Spinner.stop("PM2 start failed");
        clack.log.error(`PM2 error: ${error.message}`);
        clack.note(
          `You can start manually with:\n  pm2 start "genssh start" --name genssh-agent`,
        );
      }
    } else {
      const gensshPath = process.argv[1];

      const child = spawn("node", [gensshPath, "start"], {
        detached: true,
        stdio: "ignore",
        cwd: process.cwd(),
      });

      child.unref();

      clack.note(
        `Bot started in background (PID: ${child.pid})\n\n` +
          `⚠️ PM2 not detected. For production, install PM2:\n` +
          `  npm install pm2 -g\n\n` +
          `To stop this instance:\n` +
          `  kill ${child.pid}`,
      );
    }

    clack.outro("Telegram agent is running! 🚀");
    process.exit(0);
  } else {
    clack.note(
      `To start the bot later, run:\n\n  genssh start\n\nFor 24/7 operation:\n  pm2 start "genssh start" --name genssh-agent`,
    );
    clack.outro("Telegram configured successfully! 🎉");
    process.exit(0);
  }
}
