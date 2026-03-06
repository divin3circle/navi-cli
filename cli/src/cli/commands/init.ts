import * as clack from "@clack/prompts";
import { Identity } from "../../core/Identity.js";
import { ConfigManager } from "../../config/ConfigManager.js";
import { homedir, hostname } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";
import { execaCommand } from "execa";

export async function initCommand() {
  console.clear();

  if (Identity.isInitialized()) {
    const shouldReinit = await clack.confirm({
      message:
        "GenSSH is already initialized. Reinitialize? (This will overwrite your config)",
      initialValue: false,
    });

    if (clack.isCancel(shouldReinit) || !shouldReinit) {
      clack.cancel("Initialization cancelled.");
      process.exit(0);
    }
  }

  console.clear();
  console.log("\x1b[1m");
  console.log("    ██████  ███████ ███    ██ ███████ ███████ ██   ██ ");
  console.log("    ██      ██      ████   ██ ██      ██      ██   ██ ");
  console.log("    ██  ███ █████   ██ ██  ██ ███████ ███████ ███████ ");
  console.log("    ██   ██ ██      ██  ██ ██      ██      ██ ██   ██ ");
  console.log("    ██████  ███████ ██   ████ ███████ ███████ ██   ██ ");
  console.log("\x1b[90m");

  clack.intro("🚀 Welcome to GenSSH");

  const geminiGroup = await clack.group(
    {
      apiKey: () =>
        clack.password({
          message: "Enter your Gemini API key:",
          validate: (value) => {
            if (!value) return "API key is required";
            if (value.length < 20) return "API key seems too short";
            return undefined;
          },
        }),

      model: () =>
        clack.select({
          message: "Select Gemini model:",
          options: [
            // Gemini 3 (Current Gen)
            {
              value: "gemini-3-pro-preview",
              label: "Gemini 3 Pro Preview",
              hint: "Google’s most intelligent and capable model",
            },
            {
              value: "gemini-3-flash-preview",
              label: "Gemini 3 Flash Preview",
              hint: "A highly efficient, fast, and cost-effective model (Recommended)",
            },
            // Gemini 2.5 (Generally Available)
            {
              value: "gemini-2.5-pro",
              label: "Gemini 2.5 Pro",
              hint: "Large context, adaptive thinking",
            },
            {
              value: "gemini-2.5-flash",
              label: "Gemini 2.5 Flash",
              hint: "Balanced intelligence & speed",
            },
            {
              value: "gemini-2.5-flash-lite",
              label: "Gemini 2.5 Flash-Lite",
              hint: "High throughput, cost effective",
            },
          ],
          initialValue: "gemini-3-flash-preview",
        }),
    },
    {
      onCancel: () => {
        clack.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  // Optional Brave Search
  const useBraveSearch = await clack.confirm({
    message: "Enable Brave Search for web lookups?",
    initialValue: false,
  });

  let braveApiKey: string | undefined;
  if (useBraveSearch && !clack.isCancel(useBraveSearch)) {
    const braveKey = await clack.password({
      message: "Enter Brave Search API key:",
      validate: (value) => {
        if (useBraveSearch && !value)
          return "Brave API key required if enabled";
        return undefined;
      },
    });

    if (!clack.isCancel(braveKey)) {
      braveApiKey = braveKey as string;
    }
  }

  const identityGroup = await clack.group(
    {
      name: () =>
        clack.text({
          message: "What should we name your agent?",
          placeholder: "Atlas",
          defaultValue: "Atlas",
          validate: (value) => {
            if (!value) return "Agent name is required";
            if (value.length > 20) return "Name too long (max 20 chars)";
            return undefined;
          },
        }),

      emoji: () =>
        clack.select({
          message: "Choose an animal emoji for your agent:",
          options: [
            { value: "🦅", label: "Eagle", hint: "Sharp & Strategic" },
            { value: "🐺", label: "Wolf", hint: "Loyal & Protective" },
            { value: "🦊", label: "Fox", hint: "Clever & Quick" },
            { value: "🐻", label: "Bear", hint: "Strong & Reliable" },
            { value: "🦉", label: "Owl", hint: "Wise & Observant" },
            { value: "🐉", label: "Dragon", hint: "Powerful & Vigilant" },
          ],
          initialValue: "🦅",
        }),

      userName: () =>
        clack.text({
          message: "What should the agent call you?",
          placeholder: "Boss",
          defaultValue: "Boss",
        }),

      notifications: () =>
        clack.select({
          message: "Notification preference for updates:",
          options: [
            {
              value: "immediate",
              label: "Immediate",
              hint: "Get notified right away",
            },
            { value: "hourly", label: "Hourly", hint: "Summary every hour" },
            { value: "daily", label: "Daily", hint: "Daily digest" },
          ],
          initialValue: "immediate",
        }),
    },
    {
      onCancel: () => {
        clack.cancel("Setup cancelled.");
        process.exit(0);
      },
    },
  );

  const s = clack.spinner();
  s.start("Setting up GenSSH");

  try {
    const gensshDir = join(homedir(), ".genssh");
    const abilitiesDir = join(gensshDir, "abilities");
    const logsDir = join(gensshDir, "logs");

    await mkdir(gensshDir, { recursive: true });
    await mkdir(abilitiesDir, { recursive: true });
    await mkdir(logsDir, { recursive: true });

    const systemHostname = hostname();
    let osInfo = "Unknown";
    try {
      const { stdout } = await execaCommand("uname -s");
      osInfo = stdout.trim();
    } catch {
      osInfo = process.platform;
    }

    // Create identity
    const identity = new Identity({
      agent: {
        name: identityGroup.name as string,
        emoji: identityGroup.emoji as string,
        personality: ["efficient", "proactive", "respectful"],
        createdAt: new Date(),
      },
      user: {
        preferredName: identityGroup.userName as string,
        notificationPreferences: {
          critical: "immediate",
          updates: identityGroup.notifications as
            | "immediate"
            | "hourly"
            | "daily",
        },
      },
      server: {
        hostname: systemHostname,
        os: osInfo,
        installedServices: [],
      },
    });

    await identity.save();

    // Save configuration with encryption
    const config = new ConfigManager();
    await config.setEncrypted("geminiApiKey", geminiGroup.apiKey as string);
    config.set("geminiModel", geminiGroup.model as string);

    if (braveApiKey) {
      await config.setEncrypted("braveApiKey", braveApiKey);
    }
    config.set("telegramEnabled", false);

    s.stop("✓ GenSSH initialized successfully!");

    clack.note(
      `${identityGroup.emoji} ${identityGroup.name} is ready to help!

Next steps:

  genssh chat          Start chatting with your agent
  genssh ability add   Create a custom ability
  genssh telegram setup  Setup Telegram integration
  genssh status        View agent status

Files created:
  ~/.genssh/identity.json
  ~/.genssh/config.json
  ~/.genssh/abilities/
  ~/.genssh/logs/`,
      "Setup Complete",
    );

    clack.outro(`Ready to manage ${systemHostname}! 🚀`);
  } catch (error: any) {
    s.stop("✗ Setup failed");
    clack.log.error(`Error: ${error.message}`);
    clack.outro("Please try again or check the error above.");
    process.exit(1);
  }
}
