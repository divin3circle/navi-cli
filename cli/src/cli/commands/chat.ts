import { Identity } from "../../core/Identity.js";
import { Agent, AgentResponse } from "../../core/Agent.js";
import { ChatHistory } from "../../utils/ChatHistory.js";
import { Spinner } from "../../utils/Spinner.js";
import readline from "readline";

interface Message {
  role: "user" | "agent" | "system";
  content: string;
  timestamp: Date;
  requiresApproval?: boolean;
  action?: AgentResponse["action"];
}

export async function chatCommand(options?: { clearHistory?: boolean }) {
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

    const passwordPrompter = async (): Promise<string> => {
      return new Promise((resolve) => {
        console.log(
          "\x1b[33m\n🔒 Sudo password required for this action.\x1b[0m",
        );
        const pwRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: true, // Important for masking if we could, but Node readline is tricky with masking
        });

        // Hide input hack for password
        (pwRl as any).input.on("keypress", function (c: any, k: any) {
          // override default output to hide chars?
          // Simple approach: standard input for now, masking is complex in raw readline
        });

        pwRl.question("  \x1b[90mPassword: \x1b[0m", (answer) => {
          pwRl.close();
          process.stdout.write("\x1b[1A\r\x1b[K"); // Clear the password line for security
          console.log("  \x1b[32m✓ Password received\x1b[0m");
          resolve(answer);
        });

        // Basic masking attempt (Node readline 'mute' is hard without libraries)
        // Ideally we'd use a lib like 'read' here, but keeping deps minimal.
      });
    };

    const agent = new Agent(identity, passwordPrompter);
    await agent.initialize();

    if (options?.clearHistory) {
      await ChatHistory.clear();
      console.log("✓ Chat history cleared");
      console.log("");
    }

    const savedHistory = await ChatHistory.load();
    let messages: Message[] = [];
    const agentName = identity.data.agent.name;
    const userName = identity.data.user.preferredName;
    const emoji = identity.data.agent.emoji;

    console.clear();
    console.log("\x1b[1m");
    console.log("    ██████  ███████ ███    ██ ███████ ███████ ██   ██ ");
    console.log("    ██      ██      ████   ██ ██      ██      ██   ██ ");
    console.log("    ██  ███ █████   ██ ██  ██ ███████ ███████ ███████ ");
    console.log("    ██   ██ ██      ██  ██ ██      ██      ██ ██   ██ ");
    console.log("    ██████  ███████ ██   ████ ███████ ███████ ██   ██ ");
    console.log("\x1b[90m");
    console.log("");
    console.log(`                                                           `);
    console.log(
      `    ${emoji} ${agentName} is connected to ${identity.data.server.hostname.padEnd(30)}`,
    );
    console.log(`                                                           `);
    console.log(`    \x1b[90m Press Ctrl+C to exit\x1b[0m`);
    console.log("");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    const formatMessage = (
      role: string,
      content: string,
      colorCode: string,
    ) => {
      const lines = content.trim().split("\n");
      console.log(`\n    ${colorCode}● ${role}\x1b[0m`);
      lines.forEach((line) => {
        console.log(`    \x1b[90m│\x1b[0m ${line}`);
      });
    };

    const printUserMessage = (msg: string) => {
      process.stdout.write("\x1b[1A\r\x1b[K");
      formatMessage(userName, msg, "\x1b[41m");
    };

    const printAgentMessage = async (msg: string) => {
      formatMessage(`${emoji} ${agentName}`, msg.trim(), "\x1b[36m");
    };

    const printSystemMessage = (msg: string) => {
      console.log(`\x1b[90m    │  ${msg}\x1b[0m`);
    };

    const askApproval = async (
      msg: string | undefined,
      needsSudo: boolean = false,
    ): Promise<{ approved: boolean; password?: string }> => {
      console.log(`    \x1b[90m│\x1b[0m`);
      if (msg) console.log(`    \x1b[90m│\x1b[0m  \x1b[33m⚠️  ${msg}\x1b[0m`);
      console.log(`    \x1b[90m│\x1b[0m`);

      if (needsSudo) {
        console.log(
          `    \x1b[33m⋮\x1b[0m  This action needs \x1b[1msudo\x1b[0m. Enter your password to \x1b[32mapprove\x1b[0m or type \x1b[31m"deny"\x1b[0m.`,
        );
      } else {
        console.log(
          `    \x1b[33m⋮\x1b[0m  Type \x1b[1m"approve"\x1b[0m to proceed or \x1b[1m"deny"\x1b[0m to cancel.`,
        );
      }

      console.log("");
      console.log(
        `    \x1b[90m───────────────────────────────────────────────────────────\x1b[0m`,
      );
      console.log("");

      return new Promise((resolve) => {
        const approvalRl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        // If it's a password, we should technically mask it.
        // Simplified approach for now:
        approvalRl.question(`    \x1b[32m›\x1b[0m `, (answer) => {
          approvalRl.close();
          const lower = answer.toLowerCase();
          // Move cursor up to overwrite the question
          process.stdout.write("\x1b[1A\r\x1b[K");

          if (lower === "deny" || lower === "n" || lower === "no") {
            console.log(`    \x1b[31m✗ Denied\x1b[0m`);
            resolve({ approved: false });
          } else if (
            lower === "approve" ||
            lower === "y" ||
            lower === "yes" ||
            needsSudo
          ) {
            // For sudo, the answer is the password. For non-sudo, it's just a confirmation string.
            const password =
              needsSudo &&
              lower !== "approve" &&
              lower !== "y" &&
              lower !== "yes"
                ? answer
                : undefined;

            if (
              needsSudo &&
              !password &&
              (lower === "approve" || lower === "y" || lower === "yes")
            ) {
              // User approved but didn't give password yet? Or passwordless?
              // We will catch this in executeAction's own prompter if needed.
            }

            console.log(`    \x1b[32m✓ Approved\x1b[0m`);
            resolve({ approved: true, password: password });
          } else {
            console.log(`    \x1b[31m✗ Denied (Unknown command)\x1b[0m`);
            resolve({ approved: false });
          }
        });
      });
    };

    const promptLoop = () => {
      rl.question(`    \x1b[32m›\x1b[0m `, async (userInput) => {
        const input = userInput.trim();
        if (!input) {
          process.stdout.write("\x1b[1A\r\x1b[K");
          promptLoop();
          return;
        }

        printUserMessage(input);
        messages.push({ role: "user", content: input, timestamp: new Date() });

        const spinner = new Spinner();
        spinner.start(`  ${emoji} is thinking...`);

        try {
          const context = ChatHistory.getContext(messages, 10);
          const response = await agent.processMessage(input, context);

          spinner.stop();

          messages.push({
            role: "agent",
            content: response.content,
            timestamp: new Date(),
            requiresApproval: response.requiresApproval,
            action: response.action,
          });

          const isAutoExecuting = response.action && !response.requiresApproval;
          if (!isAutoExecuting) {
            await printAgentMessage(response.content);
          } else {
            console.log(`\n    \x1b[36m● ${emoji} ${agentName}\x1b[0m`);
            console.log(
              `    \x1b[90m│\x1b[0m  \x1b[90mAuto-executing safely...\x1b[0m`,
            );
          }

          if (response.action) {
            let shouldExecute = true;
            let collectedPassword: string | undefined;

            if (response.requiresApproval) {
              const actionText =
                response.action.command ||
                response.action.abilityName ||
                response.action.description ||
                "";
              const needsSudo =
                actionText.includes("sudo") ||
                response.content.toLowerCase().includes("sudo");

              const { approved, password } = await askApproval(
                "This action requires approval",
                needsSudo,
              );
              shouldExecute = approved;
              collectedPassword = password;
            }

            if (shouldExecute) {
              const execSpinner = new Spinner();
              execSpinner.start(`  Executing ${response.action.type}...`);

              try {
                const result = await agent.executeAction(
                  response.action,
                  collectedPassword,
                );
                execSpinner.stop();

                messages.push({
                  role: "agent",
                  content: result,
                  timestamp: new Date(),
                });

                const resultLines = result.split("\n");
                resultLines.forEach((line) => {
                  console.log(`    \x1b[90m│\x1b[0m ${line}`);
                });
                console.log("");
              } catch (error: any) {
                execSpinner.stop();
                const errorMsg = `Command execution failed: ${error.message}`;

                messages.push({
                  role: "system",
                  content: `Execution failed: ${error.message}`,
                  timestamp: new Date(),
                });
                printSystemMessage(`Execution failed: ${error.message}`);

                const recoverySpinner = new Spinner();
                recoverySpinner.start(
                  `  ${agentName} is analyzing the error...`,
                );

                try {
                  const context = ChatHistory.getContext(messages, 10);
                  const recoveryResponse = await agent.processMessage(
                    `The previous action failed with error: ${error.message}. Please explain why and suggest a fix.`,
                    context,
                  );
                  recoverySpinner.stop();

                  messages.push({
                    role: "agent",
                    content: recoveryResponse.content,
                    timestamp: new Date(),
                  });
                  await printAgentMessage(recoveryResponse.content);
                } catch (recoveryError) {
                  recoverySpinner.stop();
                  printSystemMessage(`Failed to recover from error.`);
                }
              }
            } else {
              printSystemMessage("Action cancelled.");
            }
          }

          await ChatHistory.save(messages);
        } catch (error: any) {
          spinner.stop();
          printSystemMessage(`Error: ${error.message}`);
        }

        promptLoop();
      });
    };

    promptLoop();
    rl.on("SIGINT", async () => {
      rl.close();
      console.log("");
      console.log("💾 Saving chat history...");
      await ChatHistory.save(messages);
      console.log("👋 Goodbye!");
      process.exit(0);
    });
  } catch (error: any) {
    console.log("❌ Error starting chat");
    console.log("");
    console.log(`Error: ${error.message}`);
    console.log("");
    process.exit(1);
  }
}
