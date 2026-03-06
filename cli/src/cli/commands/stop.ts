import * as clack from "@clack/prompts";
import { execSync } from "child_process";

export async function stopCommand() {
  console.log("");
  clack.intro("🛑 Stopping GenSSH Agent");

  let pm2Running = false;
  try {
    const pm2List = execSync("pm2 jlist", { encoding: "utf-8" });
    const processes = JSON.parse(pm2List);
    pm2Running = processes.some((p: any) => p.name === "genssh-agent");
  } catch {
    // PM2 not installed or no processes
    return;
  }

  if (pm2Running) {
    const s = clack.spinner();
    s.start("Stopping PM2 process...");

    try {
      execSync("pm2 stop genssh-agent", { stdio: "ignore" });
      s.stop("Agent stopped (PM2)");

      clack.note(
        `To start again:\n` +
          `  pm2 start genssh-agent\n\n` +
          `To remove from PM2 entirely:\n` +
          `  pm2 delete genssh-agent`,
      );
    } catch (error: any) {
      s.stop("Failed to stop");
      clack.log.error(error.message);
    }
  } else {
    const s = clack.spinner();
    s.start("Looking for running agent...");

    try {
      const pids = execSync('pgrep -f "genssh start"', { encoding: "utf-8" })
        .trim()
        .split("\n")
        .filter(Boolean);

      if (pids.length === 0) {
        s.stop("No running agent found");
        clack.outro("Nothing to stop.");
        return;
      }

      for (const pid of pids) {
        try {
          execSync(`kill ${pid}`, { stdio: "ignore" });
        } catch {
          // Process might have already exited
          return;
        }
      }

      s.stop(`Stopped ${pids.length} process(es)`);
    } catch {
      s.stop("No running agent found");
      clack.outro("Nothing to stop.");
      return;
    }
  }

  clack.outro("Agent stopped! 👋");
}
