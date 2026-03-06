import { TaskScheduler } from "../../scheduler/TaskScheduler.js";
import { join } from "path";
import { homedir } from "os";
import { confirm } from "@clack/prompts";

const dbPath = join(homedir(), ".genssh", "tasks.db");
let _scheduler: TaskScheduler | null = null;

function getScheduler() {
  if (!_scheduler) {
    _scheduler = new TaskScheduler(dbPath);
  }
  return _scheduler;
}

export async function cronListCommand() {
  const scheduler = getScheduler();
  const tasks = scheduler.listTasks();

  console.log("\n📅 \x1b[1mScheduled Cron Jobs\x1b[0m\n");

  if (tasks.length === 0) {
    console.log("No cron jobs found.");
    return;
  }

  console.log(
    " \x1b[90mID".padEnd(14) + "Schedule".padEnd(16) + "Description\x1b[0m",
  );
  console.log(" ───────────────────────────────────────────────────────────");

  tasks.forEach((task) => {
    const schedule =
      task.taskType === "cron"
        ? task.cronExpression
        : `Once: ${task.runAt?.toLocaleString()}`;
    console.log(
      ` \x1b[36m${task.id.substring(0, 8)}\x1b[0m  ${(schedule || "N/A").padEnd(14)}  ${task.taskDescription}`,
    );
  });

  console.log(
    '\n\x1b[90mTip: Use "genssh stop && genssh start" to refresh the agent if you change jobs.\x1b[0m\n',
  );
}

export async function cronRemoveCommand(id: string) {
  try {
    const scheduler = getScheduler();
    const tasks = scheduler.listTasks();
    const task = tasks.find((t) => t.id.startsWith(id));

    if (!task) {
      console.log(`❌ No task found starting with ID: ${id}`);
      return;
    }

    const confirmed = await confirm({
      message: `Remove the task "${task.taskDescription}" (${task.id})?`,
      initialValue: false,
    });

    if (confirmed) {
      scheduler.removeTask(task.id);
      console.log(`✅ Task removed from database.`);
      console.log(
        `\x1b[90mNote: You may need to restart the agent (genssh stop && genssh start) for changes to take effect if it's currently running.\x1b[0m`,
      );
    }
  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}
