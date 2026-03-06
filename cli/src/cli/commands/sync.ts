import { Storage } from "@google-cloud/storage";
import { configManager } from "../../config/ConfigManager.js";
import { AbilityManager } from "../../core/AbilityManager.js";
import { intro, outro, spinner, note, text } from "@clack/prompts";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { homedir } from 'os';

export async function syncCommand(action: string) {
  intro(chalk.bgCyan.black.bold(" GenSSH GCS Sync "));

  if (action !== "push" && action !== "pull") {
    console.error(chalk.red("Invalid action. Must be 'push' or 'pull'."));
    process.exit(1);
  }

  const s = spinner();
  s.start("Checking Google Cloud credentials...");

  let storage: Storage;
  try {
    storage = new Storage();
    // Quick test if auth works
    await storage.getBuckets({ maxResults: 1 });
  } catch (err: any) {
    s.stop("Authentication Failed");
    console.error(chalk.red("\nGoogle Cloud SDK not authenticated locally."));
    console.error(chalk.dim("Please ensure you have `gcloud` installed and run:\n  gcloud auth application-default login\n"));
    process.exit(1);
  }

  // Find user's intended bucket or prompt for one
  let bucketName = configManager.get("gcpSyncBucket" as any) as string;

  s.stop("Authenticated with Google Cloud Platform.");

  if (!bucketName) {
    const bucketPrompt = await text({
      message: "Which Google Cloud Storage Bucket should we sync with?",
      placeholder: "e.g., genssh-backups-bucket",
      validate(value) {
        if (!value) return "Bucket name is required.";
      },
    });

    if (typeof bucketPrompt !== "string") {
      console.log(chalk.yellow("Sync cancelled."));
      process.exit(0);
    }
    
    bucketName = bucketPrompt;
    configManager.set("gcpSyncBucket" as any, bucketName);
  }

  const bucket = storage.bucket(bucketName);
  const CUSTOM_ABILITIES_DIR = path.join(homedir(), '.genssh', 'abilities');

  if (action === "push") {
    s.start(`Pushing GenSSH state to gs://${bucketName}...`);

    try {
      // 1. Backup Config
      const configPath = configManager.getPath();
      if (existsSync(configPath)) {
        await bucket.upload(configPath, { destination: "config/config.json" });
      }

      // 2. Backup Custom Abilities
      if (existsSync(CUSTOM_ABILITIES_DIR)) {
        const files = await fs.readdir(CUSTOM_ABILITIES_DIR);
        for (const file of files) {
          if (file.endsWith(".md")) {
            await bucket.upload(path.join(CUSTOM_ABILITIES_DIR, file), {
              destination: `abilities/${file}`
            });
          }
        }
      }

      s.stop("Backup Complete");
      note(`Successfully pushed config and blueprints to GCS.`, "Success");
    } catch (err: any) {
      s.stop("Push Failed");
      console.error(chalk.red(`Error uploading to GCS: ${err.message}`));
    }
  } 
  else if (action === "pull") {
    s.start(`Pulling GenSSH state from gs://${bucketName}...`);

    try {
      // Ensure local dirs exist
      if (!existsSync(CUSTOM_ABILITIES_DIR)) {
        await fs.mkdir(CUSTOM_ABILITIES_DIR, { recursive: true });
      }

      // 1. Pull Config
      const configPath = configManager.getPath();
      const configFile = bucket.file("config/config.json");
      const [configExists] = await configFile.exists();
      if (configExists) {
        await configFile.download({ destination: configPath });
      }

      // 2. Pull Abilities
      const [files] = await bucket.getFiles({ prefix: "abilities/" });
      for (const file of files) {
        if (file.name.endsWith(".md")) {
          const fileName = path.basename(file.name);
          await file.download({ destination: path.join(CUSTOM_ABILITIES_DIR, fileName) });
        }
      }

      s.stop("Restore Complete");
      note(`Successfully pulled config and blueprints from GCS.`, "Success");
    } catch (err: any) {
      s.stop("Pull Failed");
      console.error(chalk.red(`Error downloading from GCS: ${err.message}`));
    }
  }

  outro("Sync procedure finalized.");
}
