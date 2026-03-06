import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

export interface AgentIdentity {
  name: string;
  emoji: string;
  personality: string[];
  createdAt: Date;
}

export interface UserPreferences {
  preferredName: string;
  notificationPreferences: {
    critical: 'immediate' | 'hourly' | 'daily';
    updates: 'immediate' | 'hourly' | 'daily';
  };
}

export interface ServerInfo {
  hostname: string;
  os?: string;
  installedServices?: string[];
}

export interface IdentityData {
  agent: AgentIdentity;
  user: UserPreferences;
  server: ServerInfo;
}

export class Identity {
  private static IDENTITY_PATH = join(homedir(), '.genssh', 'identity.json');

  constructor(public data: IdentityData) {}

  /**
   * Load identity from disk
   */
  static async load(): Promise<Identity> {
    if (!existsSync(this.IDENTITY_PATH)) {
      throw new Error('GenSSH not initialized. Run `genssh init` first.');
    }

    const content = await readFile(this.IDENTITY_PATH, 'utf-8');
    const data = JSON.parse(content);

    // Parse dates
    data.agent.createdAt = new Date(data.agent.createdAt);

    return new Identity(data);
  }

  /**
   * Save identity to disk
   */
  async save(): Promise<void> {
    const dir = join(homedir(), '.genssh');

    // Ensure directory exists
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(
      Identity.IDENTITY_PATH,
      JSON.stringify(this.data, null, 2),
      'utf-8'
    );
  }

  /**
   * Check if GenSSH is initialized
   */
  static isInitialized(): boolean {
    return existsSync(this.IDENTITY_PATH);
  }

  /**
   * Get the agent's greeting message
   */
  getGreeting(): string {
    return `${this.data.agent.emoji} ${this.data.agent.name} here! How can I help with ${this.data.server.hostname} today, ${this.data.user.preferredName}?`;
  }
}
