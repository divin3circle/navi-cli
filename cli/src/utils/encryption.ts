import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

/**
 * Encryption utilities for sensitive data
 */
export class Encryption {
  private static readonly ALGORITHM = 'aes-256-cbc';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;

  /**
   * Derive an encryption key from a passphrase
   */
  static async deriveKey(passphrase: string, salt: string = 'genssh-salt'): Promise<Buffer> {
    return (await scryptAsync(passphrase, salt, Encryption.KEY_LENGTH)) as Buffer;
  }

  /**
   * Encrypt a string
   */
  static async encrypt(text: string, key: Buffer): Promise<string> {
    const iv = randomBytes(Encryption.IV_LENGTH);
    const cipher = createCipheriv(Encryption.ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a string
   */
  static async decrypt(encryptedData: string, key: Buffer): Promise<string> {
    const [ivHex, encryptedHex] = encryptedData.split(':');

    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(Encryption.ALGORITHM, key, iv);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
