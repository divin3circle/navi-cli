import { AbilityManager } from '../../core/AbilityManager.js';
import { intro, outro, select, text, confirm, note } from '@clack/prompts';
import { execa } from 'execa';
import { readFile } from 'fs/promises';

const abilityManager = new AbilityManager();

export async function abilityAddCommand() {
  intro('📝 Create a New Ability');

  const name = await text({
    message: 'What is the name of this ability? (e.g. restart-nginx)',
    placeholder: 'restart-nginx',
    validate: (value) => {
      if (!value) return 'Name is required';
      if (/[^a-zA-Z0-9-]/.test(value)) return 'Use only letters, numbers, and hyphens';
      return;
    }
  });

  if (typeof name !== 'string') return;

  const description = await text({
    message: 'Provide a brief description',
    placeholder: 'Restarts the Nginx service safely'
  });

  if (typeof description !== 'string') return;

  const stepsStr = await text({
    message: 'Enter steps (one per line, specify command in backticks)',
    placeholder: '1. Check config: `sudo nginx -t`\n2. Restart: `sudo systemctl restart nginx`'
  });

  if (typeof stepsStr !== 'string') return;

  const requiresApproval = await confirm({
    message: 'Does this action require manual approval?',
    initialValue: true
  });

  const binsStr = await text({
    message: 'Required binaries (comma separated)?',
    placeholder: 'gh, docker, curl'
  });

  const envsStr = await text({
    message: 'Required environment variables (comma separated)?',
    placeholder: 'GITHUB_TOKEN, DOCKER_HUB_KEY'
  });

  const bins = typeof binsStr === 'string' && binsStr ? binsStr.split(',').map(b => b.trim()) : [];
  const envs = typeof envsStr === 'string' && envsStr ? envsStr.split(',').map(e => e.trim()) : [];

  const metadata = {
    requires: {
        bins: bins.length > 0 ? bins : undefined,
        env: envs.length > 0 ? envs : undefined
    }
  };

  const content = `---
name: ${name}
description: ${description}
metadata: ${JSON.stringify(metadata)}
---

# Skill: ${name}

## Description

${description}

## Steps

${stepsStr}

## Approval Required

${requiresApproval ? 'Yes' : 'No'}

## Safety Checks

- None

## Rollback Procedure

- None
`;

  await abilityManager.saveCustomAbility(name, content);

  outro(`✅ Ability "${name}" created successfully!`);
}

export async function abilityListCommand() {
  const abilities = await abilityManager.listAll();
  
  console.log('\n📚 \x1b[1mAvailable Abilities\x1b[0m\n');
  
  const builtIn = abilities.filter(a => a.type === 'built-in');
  const custom = abilities.filter(a => a.type === 'custom');

  if (builtIn.length > 0) {
    console.log('\x1b[36mBuilt-in:\x1b[0m');
    builtIn.forEach(a => {
      console.log(` • \x1b[1m${a.name}\x1b[0m - ${a.description}`);
    });
    console.log('');
  }

  if (custom.length > 0) {
    console.log('\x1b[32mCustom:\x1b[0m');
    custom.forEach(a => {
      console.log(` • \x1b[1m${a.name}\x1b[0m - ${a.description}`);
    });
    console.log('');
  }

  if (abilities.length === 0) {
    console.log('No abilities found.');
  }
}

export async function abilityViewCommand(name: string) {
  try {
    const { content, type } = await abilityManager.getRaw(name);
    console.log(`\n👀 \x1b[1mViewing Ability: ${name}\x1b[0m (\x1b[90m${type}\x1b[0m)\n`);
    console.log('───────────────────────────────────────────────────────────');
    console.log(content);
    console.log('───────────────────────────────────────────────────────────\n');
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

export async function abilityRemoveCommand(name: string) {
  try {
    const { type } = await abilityManager.getRaw(name);
    if (type === 'built-in') {
      console.log('❌ Cannot remove built-in abilities.');
      return;
    }

    const confirmed = await confirm({
      message: `Are you sure you want to remove the custom ability "${name}"?`,
      initialValue: false
    });

    if (confirmed) {
      await abilityManager.removeCustomAbility(name);
      console.log(`✅ Ability "${name}" removed.`);
    }
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

export async function abilityEditCommand(name: string) {
  try {
    const { path, type } = await abilityManager.getRaw(name);
    
    if (type === 'built-in') {
      console.log('⚠️  Notice: You are editing a built-in ability. Changes might be overwritten by updates.');
      const proceed = await confirm({ message: 'Proceed anyway?', initialValue: false });
      if (!proceed) return;
    }

    const editor = process.env.EDITOR || 'vi';
    console.log(`Opening ${editor}...`);
    
    await execa(editor, [path], { stdio: 'inherit' });
    
    console.log('✅ Changes saved.');
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}
