import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { orchestrate } from "./orchestrator.js";
import { activateUlwLoop, ultraworkDirective } from "./ultrawork.js";

type CliFlags = {
  task: string;
  cwd: string;
  sessionId: string;
  maxIterations?: number;
  model?: string;
  effort?: string;
  ultrawork: boolean;
};

export async function runOrchestrateCli(argv: string[]): Promise<number> {
  const flags = parseFlags(argv);
  if (flags === null || flags.task.length === 0) {
    process.stderr.write(usage());
    return 2;
  }

  let initialPrompt = flags.task;
  if (flags.ultrawork) {
    activateUlwLoop(flags.cwd, flags.sessionId, flags.task);
    initialPrompt = ultraworkDirective(flags.task);
  }

  const result = await orchestrate({
    cwd: flags.cwd,
    initialPrompt,
    sessionId: flags.sessionId,
    maxIterations: flags.maxIterations,
    model: flags.model,
    effort: flags.effort,
    onTurn: ({ iteration, nextPrompt }) => {
      const status = nextPrompt === null ? "complete" : "continue";
      process.stderr.write(`[orchestrate] turn ${String(iteration + 1)} -> ${status}\n`);
    },
  });

  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.stopReason === "completed" ? 0 : 1;
}

function parseFlags(argv: string[]): CliFlags | null {
  const flags: CliFlags = {
    task: "",
    cwd: process.cwd(),
    sessionId: randomUUID(),
    ultrawork: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ultrawork") {
      flags.ultrawork = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) return null;
    i += 1;
    switch (arg) {
      case "--task":
        flags.task = value;
        break;
      case "--cwd":
        flags.cwd = resolve(value);
        break;
      case "--session-id":
        flags.sessionId = value;
        break;
      case "--max-iterations":
        flags.maxIterations = Number.parseInt(value, 10);
        break;
      case "--model":
        flags.model = value;
        break;
      case "--effort":
        flags.effort = value;
        break;
      default:
        return null;
    }
  }
  return flags;
}

function usage(): string {
  return [
    "Usage: omo-grok-hook orchestrate --task <TASK> [options]",
    "",
    "Headlessly drives `grok -p` in a loop, re-prompting via the same Stop-hook",
    "continuation logic (ulw-loop / ultrawork / boulder) until the plan completes.",
    "",
    "Options:",
    "  --task <TASK>            Task/prompt to drive (required)",
    "  --cwd <DIR>             Workspace root (default: cwd)",
    "  --session-id <UUID>     Grok session id (default: random UUID)",
    "  --max-iterations <N>    Continuation cap (default: 100)",
    "  --model <MODEL>         Grok model id",
    "  --effort <LEVEL>        Effort level (low|medium|high|xhigh|max)",
    "  --ultrawork            Activate the lightweight ultrawork loop for the task",
    "",
  ].join("\n");
}
