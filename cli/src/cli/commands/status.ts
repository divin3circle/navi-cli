import { Identity } from "../../core/Identity.js";
import { ConfigManager } from "../../config/ConfigManager.js";
import { AbilityManager } from "../../core/AbilityManager.js";
import { SystemCommands } from "../../integrations/SystemCommands.js";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import Database from "better-sqlite3";

export async function statusCommand() {
  console.log("");

  if (!Identity.isInitialized()) {
    console.log("❌ GenSSH not initialized");
    console.log("");
    console.log("Run this command to get started:");
    console.log("  genssh init");
    console.log("");
    return;
  }

  try {
    const identity = await Identity.load();
    const config = new ConfigManager();
    const abilityManager = new AbilityManager();
    const systemCommands = new SystemCommands();

    const systemInfo = await systemCommands.getSystemInfo();

    const abilities = await abilityManager.listAll();
    const builtInCount = abilities.filter((a) => a.type === "built-in").length;
    const customCount = abilities.filter((a) => a.type === "custom").length;

    const dbPath = join(homedir(), ".genssh", "tasks.db");
    let cronJobCount = 0;
    if (existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        const result = db
          .prepare("SELECT COUNT(*) as count FROM cron_jobs WHERE enabled = 1")
          .get() as any;
        cronJobCount = result?.count || 0;
        db.close();
      } catch {
        // Ignore DB errors
      }
    }

    const telegramEnabled = config.get("telegramEnabled");
    const telegramStatus = telegramEnabled ? "🟢 Enabled" : "⚫ Disabled";

    let geminiKeyStatus = "❌ Not set";
    let braveKeyStatus = "⚫ Not configured";
    try {
      await config.getEncrypted("geminiApiKey");
      geminiKeyStatus = "✓ Configured";
    } catch {
      // exit
      return;
    }
    try {
      await config.getEncrypted("braveApiKey");
      braveKeyStatus = "✓ Configured";
    } catch {
      // exit
      return;
    }

    let uptime = "Unknown";
    try {
      const uptimeSeconds = require("os").uptime();
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);

      if (days > 0) {
        uptime = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        uptime = `${hours}h ${minutes}m`;
      } else {
        uptime = `${minutes}m`;
      }
    } catch {
      // exit
      return;
    }

    const createdAt = identity.data.agent.createdAt;
    const daysSinceCreation = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    console.log(
      "╭─────────────────────────────────────────────────────────────╮",
    );
    console.log(
      "│                                                             │",
    );
    console.log(
      `│  ${identity.data.agent.emoji}  ${identity.data.agent.name.padEnd(54)} │`,
    );
    console.log(
      "│                                                             │",
    );
    console.log(
      "╰─────────────────────────────────────────────────────────────╯",
    );
    console.log("");

    // Agent Section
    console.log("🤖 Agent");
    console.log(`   Name                ${identity.data.agent.name}`);
    console.log(
      `   Personality         ${identity.data.agent.personality.join(", ")}`,
    );
    console.log(
      `   Created             ${createdAt.toLocaleDateString()} (${daysSinceCreation} days ago)`,
    );
    console.log("");

    console.log("👤 User");
    console.log(`   Name                ${identity.data.user.preferredName}`);
    console.log(
      `   Notifications       ${identity.data.user.notificationPreferences.updates}`,
    );
    console.log("");

    console.log("🖥️  Server");
    console.log(`   Hostname            ${systemInfo.hostname}`);
    console.log(`   OS                  ${systemInfo.os}`);
    console.log(`   Platform            ${systemInfo.platform}`);
    console.log(`   Uptime              ${uptime}`);
    console.log("");

    console.log("⚙️  Configuration");
    console.log(`   Gemini API          ${geminiKeyStatus}`);
    console.log(
      `   Gemini Model        ${config.get("geminiModel") || "Not set"}`,
    );
    console.log(`   Brave Search        ${braveKeyStatus}`);
    console.log(`  Telegram: ${telegramStatus}`);
    console.log("");

    console.log("📚 Abilities");
    console.log(`   Built-in            ${builtInCount}`);
    console.log(`   Custom              ${customCount}`);
    console.log(`   Total               ${abilities.length}`);
    console.log("");

    console.log("⏰ Cron Jobs");
    console.log(`   Active              ${cronJobCount}`);
    console.log("");

    console.log("📁 Files");
    console.log(`   Identity            ${Identity["IDENTITY_PATH"]}`);
    console.log(`   Config              ${config.getPath()}`);
    console.log(`   Database            ${dbPath}`);
    console.log(`   Logs                ~/.genssh/logs/`);
    console.log("");

    console.log("💡 Quick Actions");
    console.log("   genssh chat         Start chatting with your agent");
    console.log("   genssh ability      Manage abilities");
    console.log("   genssh discord      Configure Discord integration");
    console.log("");
  } catch (error: any) {
    console.log("❌ Error loading status");
    console.log("");
    console.log(`Error: ${error.message}`);
    console.log("");
    console.log("Try reinitializing:");
    console.log("  genssh init");
    console.log("");
    process.exit(1);
  }
}
