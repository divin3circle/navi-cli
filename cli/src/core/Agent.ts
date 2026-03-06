import { GeminiClient } from "./GeminiClient.js";
import { Identity } from "./Identity.js";
import { AbilityManager } from "./AbilityManager.js";
import { SystemCommands } from "../integrations/SystemCommands.js";
import { Logger } from "../utils/logger.js";

export interface AgentResponse {
  content: string;
  requiresApproval: boolean;
  action?: {
    type: "ability" | "command" | "schedule" | "info";
    description: string;
    abilityName?: string;
    command?: string;
    schedule?: {
      type: "cron" | "once";
      cronExpression?: string;
      delayMinutes?: number;
      taskDescription: string;
    };
  };
}

/**
 * Main agent orchestrator that handles user interactions
 * and coordinates between Gemini AI and system operations
 */
export class Agent {
  private identity: Identity;
  private gemini: GeminiClient;
  private abilityManager: AbilityManager;
  private systemCommands: SystemCommands;

  private passwordPrompter?: () => Promise<string>;

  /**
   * When true, the agent will use plain text responses (no Markdown).
   * Useful for Telegram or other platforms with limited formatting support.
   */
  public plainTextMode: boolean = false;

  constructor(identity: Identity, passwordPrompter?: () => Promise<string>) {
    this.identity = identity;
    this.gemini = new GeminiClient();
    this.abilityManager = new AbilityManager();
    this.systemCommands = new SystemCommands();
    this.passwordPrompter = passwordPrompter;
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    await this.gemini.initialize();
  }

  /**
   * Process a user message and generate a response
   */
  async processMessage(
    userMessage: string,
    conversationHistory?: string,
  ): Promise<AgentResponse> {
    await this.initialize();

    const abilities = await this.abilityManager.listAllFull();

    const prompt = `You are ${this.identity.data.agent.name}, an AI Agent assistant running on a user machine with the following personality traits: ${this.identity.data.agent.personality.join(", ")}.

User: ${this.identity.data.user.preferredName}
Server: ${this.identity.data.server.hostname}
OS: ${this.identity.data.server.os || "Unknown"}
Platform: ${process.platform}

Available specialized blueprints:
${abilities.map((a) => `--- ABILITY: ${a.name} ---\n${a.rawContent}`).join("\n\n")}

${conversationHistory ? `\nRecent conversation:\n${conversationHistory}\n` : ""}

User message: "${userMessage}"

Analyze the request and respond in JSON format:
{
  "response": "your natural language response to the user",
  "requiresApproval": boolean,
  "action": {
    "type": "ability" | "command" | "schedule" | "info",
    "description": "brief description of what you're about to do",
    "abilityName": "name of ability (blueprint) if using one",
    "command": "The specific shell command(s) to execute. Even for 'ability' type, you MUST provide the precise command(s) adapted for ${process.platform} and ${this.identity.data.server.os} using the blueprint as a guide.",
    "schedule": {
      "type": "cron" | "once",
      "cronExpression": "cron expression like '0 8 * * *' for recurring",
      "delayMinutes": number for one-time delay,
      "taskDescription": "what to do when triggered"
    }
  }
}

Guidelines:
- **Primary Intelligence**: You are a senior DevOps engineer. For almost all tasks (deploying apps, system updates, security audits, log analysis, docker management), DO NOT wait for a blueprint. Use your extensive knowledge of ${process.platform} and ${this.identity.data.server.os} to figure it out yourself.
- **Exploration**: If you aren't sure about the environment, be proactive. Use \`ls -R\`, \`find\`, \`cat\`, and other discovery tools to "look around" before proposing an action.
- **Specialized Blueprints**: The "Available specialized blueprints" section (if any) is only for non-standard, custom, or complex external integrations (like a specific private API). Default to your own expertise first.
- **Action Selection**: Prefer the "command" type for almost everything. Use "ability" ONLY if a specialized blueprint exists and fits the task perfectly.
- **Safety**: Set requiresApproval: false for read-only checks. Set requiresApproval: true for destructive actions (delete) or state changes (restart, deploy).
- **Presentation**: Use professional Markdown. Explain the *logic* briefly behind your commands so the user can learn from you.`;

    try {
      const geminiResponse = await this.gemini.generateContent(prompt);

      let jsonStr = geminiResponse.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      }

      const parsed = JSON.parse(jsonStr);

      return {
        content: parsed.response,
        requiresApproval: parsed.requiresApproval || false,
        action: parsed.action.type !== "info" ? parsed.action : undefined,
      };
    } catch (error) {
      return {
        content: `I understand you want me to: "${userMessage}". However, I'm having trouble processing that right now. \n\nError details: ${error instanceof Error ? error.message : String(error)}`,
        requiresApproval: false,
      };
    }
  }

  /**
   * Execute an approved action
   */
  async executeAction(
    action: AgentResponse["action"],
    password?: string,
  ): Promise<string> {
    if (!action) {
      throw new Error("No action to execute");
    }

    switch (action.type) {
      case "ability":
        const ability = await this.abilityManager.load(action.abilityName!);
        const { missingBins, missingEnv } =
          await this.abilityManager.checkPrerequisites(ability);

        if (missingBins.length > 0 || missingEnv.length > 0) {
          let errorMsg = `I need some things before I can use the \`${ability.name}\` blueprint:\n`;
          if (missingBins.length > 0)
            errorMsg += `\n❌ **Missing Binaries**: ${missingBins.map((b) => `\`${b}\``).join(", ")}`;
          if (missingEnv.length > 0)
            errorMsg += `\n❌ **Missing Env Vars**: ${missingEnv.map((e) => `\`${e}\``).join(", ")}`;

          errorMsg += `\n\nShould I try to install the missing tools for you, or do you want to set them up manually?`;
          return errorMsg;
        }

        if (action.command) {
          return await this.executeCommand(
            action.command,
            password,
            action.abilityName,
          );
        }
        return await this.executeAbility(action.abilityName!, password);

      case "command":
        return await this.executeCommand(action.command!, password);

      case "schedule":
        // Schedule handling is done by the caller (TelegramBot/CLI)
        // Return info about what will be scheduled
        if (action.schedule) {
          const sched = action.schedule;
          if (sched.type === "cron" && sched.cronExpression) {
            return `📅 Scheduled recurring task:\n\nCron: ${sched.cronExpression}\nTask: ${sched.taskDescription}`;
          } else if (sched.type === "once" && sched.delayMinutes) {
            return `⏰ Scheduled one-time task:\n\nIn: ${sched.delayMinutes} minutes\nTask: ${sched.taskDescription}`;
          }
        }
        return `Schedule request received but missing details.`;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Shared shell execution with sudo support
   */
  private async executeShell(
    command: string,
    password?: string,
  ): Promise<string> {
    // Check for sudo
    if (command.trim().startsWith("sudo") || command.includes(" sudo ")) {
      let sudoPassword = password || "";

      if (!sudoPassword && this.passwordPrompter) {
        Logger.info("Sudo detected, prompting for password...");
        sudoPassword = await this.passwordPrompter();
      }

      if (sudoPassword) {
        // Use sudo -S to read password from stdin
        // Rewrite command: ensure sudo uses -S
        const sudoCommand = command.replace("sudo", "sudo -S -p ''");
        return await this.systemCommands.execute(
          sudoCommand,
          30000,
          sudoPassword + "\n",
        );
      } else {
        // Try passwordless sudo
        return await this.systemCommands.execute(command);
      }
    } else {
      return await this.systemCommands.execute(command);
    }
  }

  /**
   * Execute an ability
   */
  private async executeAbility(
    abilityName: string,
    password?: string,
  ): Promise<string> {
    const ability = await this.abilityManager.load(abilityName);
    Logger.info(`Executing ability: ${abilityName}`);

    const results: string[] = [];
    const executedSteps: number[] = [];
    const rawOutputs: Array<{ step: string; output: string }> = [];

    results.push(`\x1b[1m${ability.name}\x1b[0m`);
    results.push(`${ability.description}\n`);

    try {
      // Execute each step
      for (let i = 0; i < ability.steps.length; i++) {
        const step = ability.steps[i];

        // Extract command from step (commands are in backticks)
        const commandMatch = step.match(/`([^`]+)`/);
        if (commandMatch) {
          const command = commandMatch[1];

          try {
            // Check if command should be treated as optional
            const isOptional =
              step.toLowerCase().includes("if") ||
              step.toLowerCase().includes("skip if") ||
              step.toLowerCase().includes("optional") ||
              step.toLowerCase().includes("if available") ||
              command.includes("netstat") ||
              command.includes("ss ") ||
              command.includes("pm2") ||
              command.includes("nginx");

            const output = await this.executeShell(command, password);

            executedSteps.push(i);

            // Store raw output for analysis
            rawOutputs.push({ step, output });

            Logger.info(`Step ${i + 1} completed: ${command}`);
          } catch (error: any) {
            const isOptional =
              step.toLowerCase().includes("if") ||
              step.toLowerCase().includes("skip if") ||
              step.toLowerCase().includes("optional") ||
              step.toLowerCase().includes("if available") ||
              command.includes("netstat") ||
              command.includes("ss ") ||
              command.includes("pm2") ||
              command.includes("nginx");

            if (isOptional) {
              Logger.warn(`Optional step ${i + 1} skipped: ${error.message}`);
            } else {
              throw error;
            }
          }
        }
      }

      // Analyze results with AI
      const analysis = await this.analyzeExecutionResults(
        ability.name,
        ability.description,
        rawOutputs,
        this.plainTextMode,
      );

      return analysis;
    } catch (error: any) {
      Logger.error(`Ability execution failed at step: ${error.message}`);
      results.push(`\n\x1b[31m✗ Error: ${error.message}\x1b[0m`);

      // Attempt rollback if there are rollback procedures
      if (ability.rollbackProcedure.length > 0 && executedSteps.length > 0) {
        results.push(`\n\x1b[33mAttempting rollback...\x1b[0m`);
        try {
          await this.rollbackAbility(ability, executedSteps);
          results.push(`\x1b[32m✓ Rollback completed\x1b[0m`);
        } catch (rollbackError: any) {
          results.push(
            `\x1b[31m✗ Rollback failed: ${rollbackError.message}\x1b[0m`,
          );
          Logger.error(`Rollback failed: ${rollbackError.message}`);
        }
      }

      return results.join("\n");
    }
  }

  /**
   * Execute a shell command
   */
  private async executeCommand(
    command: string,
    password?: string,
    abilityName?: string,
  ): Promise<string> {
    const contextName = abilityName || "Direct Command";
    const contextDesc = abilityName
      ? `Executing ability blueprint: ${abilityName}`
      : `Executed command: ${command}`;

    Logger.info(`Executing [${contextName}]: ${command}`);

    try {
      const output = await this.executeShell(command, password);

      // Analyze the raw command output just like an ability
      const analysis = await this.analyzeExecutionResults(
        contextName,
        contextDesc,
        [{ step: command, output }],
        this.plainTextMode,
      );

      return analysis;
    } catch (error: any) {
      Logger.error(`Command execution failed: ${error.message}`);
      // Also analyze failures if possible, or fall back to error
      return `\x1b[1mCommand:\x1b[0m ${command}\n\n\x1b[31m✗ Error: ${error.message}\x1b[0m`;
    }
  }

  /**
   * Rollback an ability after failure
   */
  private async rollbackAbility(
    ability: any,
    executedSteps: number[],
  ): Promise<void> {
    Logger.info(`Rolling back ability: ${ability.name}`);

    // Execute rollback procedures in reverse order
    for (const step of ability.rollbackProcedure.reverse()) {
      const commandMatch = step.match(/`([^`]+)`/);
      if (commandMatch) {
        const command = commandMatch[1];
        await this.systemCommands.execute(command);
      }
    }
  }

  /**
   * Analyze execution results with AI to provide human-readable summary
   */
  private async analyzeExecutionResults(
    abilityName: string,
    abilityDescription: string,
    outputs: Array<{ step: string; output: string }>,
    plainText: boolean = false,
  ): Promise<string> {
    const outputsText = outputs
      .map((o, i) => `Step ${i + 1}: ${o.step}\nOutput:\n${o.output}\n`)
      .join("\n---\n");

    const formatInstructions = plainText
      ? `Be concise and conversational. Use plain text only, NO markdown formatting, NO tables, NO code blocks. Just natural sentences.`
      : `Be concise and conversational. Format the output using Markdown.
- Use **tables** for metrics or lists of data.
- Use **bold** for key values.
- Use bullet points for insights.
- Don't show raw command output unless absolutely necessary.
- Translate technical data into plain English.`;

    const prompt = `You are ${this.identity.data.agent.name}, an AI DevOps assistant (${this.identity.data.agent.personality.join(", ")}).
You just executed the following operation and need to explain the outcome to ${this.identity.data.user.preferredName}.

Operation: ${abilityName}
Description: ${abilityDescription}

Raw command outputs:
${outputsText}

Instructions:
1. Provide a human-readable, conversational summary of what just happened.
2. Synthesize the findings (don't just repeat the output).
3. If anything went wrong, explain why and what it means.
4. If it was successful, confirm the result and mention any key insights.
5. ${formatInstructions}

Respond as if you are talking to the user directly after the task is finished.
Your response:`;

    try {
      const analysis = await this.gemini.generateContent(prompt);
      return analysis.trim();
    } catch (error: any) {
      Logger.error(`Analysis failed: ${error.message}`);
      return `I've finished the operation "${abilityName}". The commands ran successfully, but I was unable to generate a detailed summary.`;
    }
  }

  /**
   * Get the agent's greeting
   */
  getGreeting(): string {
    return this.identity.getGreeting();
  }
}
