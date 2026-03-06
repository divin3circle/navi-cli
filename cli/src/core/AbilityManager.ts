import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AbilityMetadata {
  requires?: {
    bins?: string[];
    env?: string[];
  };
}

export interface Ability {
  name: string;
  description: string;
  type: 'built-in' | 'custom';
  metadata: AbilityMetadata;
  requiresApproval: boolean;
  prerequisites: string[];
  steps: string[];
  safetyChecks: string[];
  rollbackProcedure: string[];
  expectedOutcome: string;
  errorHandling: string;
  rawContent: string;
}

/**
 * Manager for loading and parsing ability markdown files
 */
export class AbilityManager {
  private static CUSTOM_DIR = join(homedir(), '.genssh', 'abilities');

  /**
   * Get potential built-in directories
   */
  private getBuiltInDirs(): string[] {
    return [
      join(process.cwd(), 'abilities'), // Local dev / User provided in current dir
      join(__dirname, '..', '..', 'abilities'), // Relative to this file (src/core or dist/core)
    ];
  }

  /**
   * List all available abilities
   */
  async listAll(): Promise<Array<{ name: string; description: string; type: 'built-in' | 'custom' }>> {
    const abilities: Array<{ name: string; description: string; type: 'built-in' | 'custom' }> = [];
    const seenNames = new Set<string>();

    // Load built-in abilities from all potential directories
    const builtInDirs = this.getBuiltInDirs();
    
    for (const dir of builtInDirs) {
        if (existsSync(dir)) {
            try {
                const builtInFiles = await readdir(dir);
                for (const file of builtInFiles) {
                    if (file.endsWith('.md')) {
                        const name = file.replace('.md', '');
                        if (seenNames.has(name)) continue;

                        try {
                            const ability = await this.load(name);
                            abilities.push({
                                name,
                                description: ability.description,
                                type: 'built-in',
                            });
                            seenNames.add(name);
                        } catch (err) {
                            // Ignore malformed files
                        }
                    }
                }
            } catch (err) {
                // Ignore directory read errors
            }
        }
    }

    // Load custom abilities
    if (existsSync(AbilityManager.CUSTOM_DIR)) {
      const customFiles = await readdir(AbilityManager.CUSTOM_DIR);
      for (const file of customFiles) {
        if (file.endsWith('.md')) {
          const name = file.replace('.md', '');
          const ability = await this.load(name);
          abilities.push({
            name,
            description: ability.description,
            type: 'custom',
          });
        }
      }
    }

    return abilities;
  }

  /**
   * List all available abilities with full details
   */
  async listAllFull(): Promise<Ability[]> {
    const list = await this.listAll();
    const fullAbilities: Ability[] = [];
    for (const item of list) {
        try {
            const full = await this.load(item.name);
            fullAbilities.push(full);
        } catch (e) {
            // Skip broken ones
        }
    }
    return fullAbilities;
  }

  async load(name: string): Promise<Ability> {
    // Try custom first, then built-in
    // Normalize name: try exact, then try replacing underscores with hyphens
    const namesToTry = [name, name.replace(/_/g, '-'), name.replace(/-/g, '_')];
    
    for (const tryName of namesToTry) {
        let path = join(AbilityManager.CUSTOM_DIR, `${tryName}.md`);
        let type: 'built-in' | 'custom' = 'custom';

        if (existsSync(path)) {
            const content = await readFile(path, 'utf-8');
            return this.parse(content, tryName, type);
        }
        
    // Try built-in directories
    const builtInDirs = this.getBuiltInDirs();
    for (const dir of builtInDirs) {
        path = join(dir, `${tryName}.md`);
        type = 'built-in';
        if (existsSync(path)) {
            const content = await readFile(path, 'utf-8');
            return this.parse(content, tryName, type);
        }
    }
    }

    throw new Error(`Ability "${name}" not found (checked: ${namesToTry.join(', ')})`);
  }

  /**
   * Get raw markdown content for an ability
   */
  async getRaw(name: string): Promise<{ content: string; path: string; type: 'built-in' | 'custom' }> {
      const namesToTry = [name, name.replace(/_/g, '-'), name.replace(/-/g, '_')];
      
      for (const tryName of namesToTry) {
          let path = join(AbilityManager.CUSTOM_DIR, `${tryName}.md`);
          if (existsSync(path)) {
              const content = await readFile(path, 'utf-8');
              return { content, path, type: 'custom' };
          }
          
          const builtInDirs = this.getBuiltInDirs();
          for (const dir of builtInDirs) {
              path = join(dir, `${tryName}.md`);
              if (existsSync(path)) {
                  const content = await readFile(path, 'utf-8');
                  return { content, path, type: 'built-in' };
              }
          }
      }
      throw new Error(`Ability "${name}" not found`);
  }

  /**
   * Check if an ability's prerequisites (bins and env vars) are met
   */
  async checkPrerequisites(ability: Ability): Promise<{
    missingBins: string[];
    missingEnv: string[];
  }> {
    const missingBins: string[] = [];
    const missingEnv: string[] = [];

    const { requires } = ability.metadata;
    if (!requires) return { missingBins, missingEnv };

    // Check bins
    if (requires.bins) {
        const { execaCommand } = await import('execa');
        for (const bin of requires.bins) {
            try {
                await execaCommand(`command -v ${bin}`);
            } catch {
                missingBins.push(bin);
            }
        }
    }

    // Check env vars
    if (requires.env) {
        for (const envVar of requires.env) {
            if (!process.env[envVar]) {
                missingEnv.push(envVar);
            }
        }
    }

    return { missingBins, missingEnv };
  }

  /**
   * Parse ability markdown content
   */
  private parse(content: string, name: string, type: 'built-in' | 'custom'): Ability {
    const lines = content.split('\n');

    const ability: Ability = {
      name,
      description: '',
      type,
      metadata: {},
      requiresApproval: true,
      prerequisites: [],
      steps: [],
      safetyChecks: [],
      rollbackProcedure: [],
      expectedOutcome: '',
      errorHandling: '',
      rawContent: content,
    };

    // Parse Metadata (Frontmatter)
    if (content.startsWith('---')) {
        const matches = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (matches) {
            const yamlStr = matches[1];
            // Simple YAML parsing for name, description, and metadata
            const metadataMatch = yamlStr.match(/metadata:\s*(\{.*\})/);
            if (metadataMatch) {
                try {
                    ability.metadata = JSON.parse(metadataMatch[1]);
                } catch (e) {
                    // Ignore parse errors
                }
            }
            const descMatch = yamlStr.match(/description:\s*(.*)/);
            if (descMatch) ability.description = descMatch[1].trim();
        }
    }

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Section headers
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.substring(3).toLowerCase();
        continue;
      }

      // Skip empty lines and main title
      if (!trimmed || trimmed.startsWith('# Skill:')) {
        continue;
      }

      // Parse based on current section
      switch (currentSection) {
        case 'description':
          ability.description = trimmed;
          break;

        case 'prerequisites':
          if (trimmed.startsWith('- ')) {
            ability.prerequisites.push(trimmed.substring(2));
          }
          break;

        case 'steps':
          if (/^\d+\./.test(trimmed)) {
            ability.steps.push(trimmed.replace(/^\d+\.\s*/, ''));
          }
          break;

        case 'approval required':
          ability.requiresApproval = trimmed.toLowerCase() === 'yes';
          break;

        case 'safety checks':
          if (trimmed.startsWith('- ')) {
            ability.safetyChecks.push(trimmed.substring(2));
          }
          break;

        case 'rollback procedure':
          if (/^\d+\./.test(trimmed)) {
            ability.rollbackProcedure.push(trimmed.replace(/^\d+\.\s*/, ''));
          }
          break;

        case 'expected outcome':
          ability.expectedOutcome += trimmed + ' ';
          break;

        case 'error handling':
          ability.errorHandling += trimmed + ' ';
          break;
      }
    }

    return ability;
  }

  /**
   * Save a custom ability
   */
  async saveCustomAbility(name: string, content: string): Promise<void> {
    const path = join(AbilityManager.CUSTOM_DIR, `${name}.md`);
    await writeFile(path, content, 'utf-8');
  }

  /**
   * Remove a custom ability
   */
  async removeCustomAbility(name: string): Promise<void> {
    const path = join(AbilityManager.CUSTOM_DIR, `${name}.md`);

    if (!existsSync(path)) {
      throw new Error(`Custom ability "${name}" not found`);
    }

    const { unlink } = await import('fs/promises');
    await unlink(path);
  }
}
