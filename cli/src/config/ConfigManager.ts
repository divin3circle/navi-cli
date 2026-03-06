import Conf from "conf";
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

export interface GenSSHConfig {
  geminiModel: string;
  telegramBotToken?: string;
  telegramOwnerId?: string;
  telegramEnabled?: boolean;
}

/**
 * Configuration manager with encrypted storage for sensitive data
 */
export class ConfigManager {
  private config: Conf<GenSSHConfig>;
  private encryptionKey: Buffer | null = null;

  constructor() {
    this.config = new Conf<GenSSHConfig>({
      projectName: "genssh",
      cwd: process.env.HOME,
      configName: "config",
    });
  }

  /**
   * Get encryption key (derived from machine ID + user home)
   */
  private async getEncryptionKey(): Promise<Buffer> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    const keyMaterial = `${process.env.HOME}-${process.platform}-genssh-v1`;
    this.encryptionKey = (await scryptAsync(keyMaterial, "salt", 32)) as Buffer;

    return this.encryptionKey;
  }

  /**
   * Encrypt a string value
   */
  private async encrypt(text: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    return `${iv.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt a string value
   */
  private async decrypt(text: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const [ivHex, encryptedHex] = text.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Set a regular configuration value
   */
  set<K extends keyof GenSSHConfig>(key: K, value: GenSSHConfig[K]): void {
    this.config.set(key, value);
  }

  /**
   * Get a regular configuration value
   */
  get<K extends keyof GenSSHConfig>(key: K): GenSSHConfig[K] | undefined {
    return this.config.get(key);
  }

  /**
   * Set an encrypted configuration value (for API keys, tokens, etc.)
   */
  async setEncrypted(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(value);
    this.config.set(`encrypted.${key}` as any, encrypted);
  }

  /**
   * Get and decrypt a configuration value
   */
  async getEncrypted(key: string): Promise<string> {
    const encrypted = this.config.get(`encrypted.${key}` as any) as string;

    if (!encrypted) {
      throw new Error(`Encrypted key "${key}" not found in configuration`);
    }

    return await this.decrypt(encrypted);
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.config.has(key);
  }

  /**
   * Delete a configuration key
   */
  delete(key: string): void {
    this.config.delete(key);
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config.clear();
  }

  /**
   * Get the path to the configuration file
   */
  getPath(): string {
    return this.config.path;
  }
}
