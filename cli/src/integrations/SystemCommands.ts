import { execa } from "execa";
import { platform, hostname, release } from "os";

export interface SystemInfo {
  hostname: string;
  os: string;
  platform: string;
  release: string;
}

/**
 * System command execution utilities
 */
export class SystemCommands {
  /**
   * Get system information
   */
  async getSystemInfo(): Promise<SystemInfo> {
    return {
      hostname: hostname(),
      os: this.getOSName(),
      platform: platform(),
      release: release(),
    };
  }

  /**
   * Execute a shell command safely
   */
  async execute(command: string, timeoutMs: number = 30000, input?: string): Promise<string> {
    try {
      const { stdout, stderr } = await execa("bash", ["-c", command], {
        timeout: timeoutMs,
        input: input, // Pass stdin if provided
      });
      return stdout || stderr || "Command executed successfully (no output)";
    } catch (error: any) {
      if (error.killed) {
        throw new Error(`Command timeout after ${timeoutMs}ms: ${command}`);
      }
      throw new Error(
        `Command failed: ${error.message}\n${error.stderr || ""}`,
      );
    }
  }

  /**
   * Check if a command exists in the system
   */
  async commandExists(command: string): Promise<boolean> {
    try {
      await execa("which", [command]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a friendly OS name
   */
  private getOSName(): string {
    const p = platform();
    switch (p) {
      case "linux":
        return "Linux";
      case "darwin":
        return "macOS";
      case "win32":
        return "Windows";
      default:
        return p;
    }
  }
}
