#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { chatCommand } from "./commands/chat.js";
import {
  abilityAddCommand,
  abilityListCommand,
  abilityViewCommand,
  abilityRemoveCommand,
  abilityEditCommand,
} from "./commands/ability.js";
import { telegramSetupCommand } from "./commands/telegram.js";
import { serverCommand } from "./commands/server.js";
import { stopCommand } from "./commands/stop.js";
import { cronListCommand, cronRemoveCommand } from "./commands/cron.js";
import { statusCommand } from "./commands/status.js";
import { liveCommand } from "./commands/live.js";
import { syncCommand } from "./commands/sync.js";

const program = new Command();

program
  .name("genssh")
  .description("An Agent for your server powered by Google Gemini")
  .version("1.0.0");

// Main commands
program
  .command("init")
  .description("Initialize GenSSH agent")
  .action(initCommand);

program
  .command("chat")
  .description("Open interactive chat with your agent")
  .option("--clear-history", "Clear chat history before starting")
  .action(chatCommand);

// Sync management overlay
program
  .command("sync")
  .description("Backup or Restore agent state (Memories & Blueprints) to Google Cloud Storage")
  .argument("<action>", "'push' to backup, 'pull' to restore")
  .action(syncCommand);

// Ability management
const ability = program
  .command("ability")
  .description("Manage agent abilities");

ability
  .command("add")
  .description("Create a new custom ability")
  .action(abilityAddCommand);

ability
  .command("list")
  .description("List all available abilities")
  .action(abilityListCommand);

ability
  .command("view <name>")
  .description("View details of a specific ability")
  .action(abilityViewCommand);

ability
  .command("remove <name>")
  .description("Remove a custom ability")
  .action(abilityRemoveCommand);

ability
  .command("edit <name>")
  .description("Edit a custom ability")
  .action(abilityEditCommand);

// Telegram integration
program
  .command("telegram")
  .description("Manage Telegram integration")
  .argument("[action]", "Action to perform (setup)", "setup")
  .action((action) => {
    if (action === "setup") {
      telegramSetupCommand();
    } else {
      console.log('Unknown action. Try "setup".');
    }
  });

// Cron management
const cronCmd = program.command("cron").description("Manage cron jobs");

cronCmd
  .command("list")
  .description("List all cron jobs")
  .action(cronListCommand);

cronCmd
  .command("remove <id>")
  .description("Remove a cron job")
  .action(cronRemoveCommand);

// Start command
program
  .command("start")
  .description("Start the GenSSH agent daemon (Telegram Bot)")
  .action(serverCommand);

// Stop command
program
  .command("stop")
  .description("Stop the running GenSSH agent daemon")
  .action(stopCommand);

// Status command
program
  .command("status")
  .description("Show agent status and health")
  .action(statusCommand);

// Live mode (Agent Relay)
program
  .command("live")
  .description("Boot the agent into Live mode (WebRTC/Socket) connected to the Cloud Dashboard")
  .action(liveCommand);

// Parse arguments
program.parse();
