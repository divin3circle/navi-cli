import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { ConfigManager } from '../config/ConfigManager.js';

/**
 * Wrapper for Google Gemini API
 */
export class GeminiClient {
  private genAI?: GoogleGenerativeAI;
  private model?: GenerativeModel;
  private config: ConfigManager;

  constructor() {
    this.config = new ConfigManager();
  }

  /**
   * Initialize the Gemini client
   * Must be called before using the client
   */
  async initialize(): Promise<void> {
    const apiKey = await this.config.getEncrypted('geminiApiKey');
    const modelName = this.config.get('geminiModel') || 'gemini-3-flash';

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  /**
   * Generate content from a prompt
   */
  async generateContent(prompt: string): Promise<string> {
    if (!this.model) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('Failed to initialize Gemini model');
    }

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Start a chat session
   */
  async startChat(history: Array<{ role: 'user' | 'model'; parts: string[] }> = []) {
    if (!this.model) {
      await this.initialize();
    }

    if (!this.model) {
      throw new Error('Failed to initialize Gemini model');
    }

    return this.model.startChat({
      history: history.map(msg => ({
        role: msg.role,
        parts: msg.parts.map(text => ({ text })),
      })),
    });
  }

  /**
   * Send a message in a chat session
   */
  async sendMessage(
    chat: Awaited<ReturnType<typeof this.startChat>>,
    message: string
  ): Promise<string> {
    const result = await chat.sendMessage(message);
    const response = await result.response;
    return response.text();
  }
}
