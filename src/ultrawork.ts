import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { hasFullUlwLoopPlan } from "./ulw-loop-grok.js";

const ULTRAWORK_PATTERN = /(?:^|\s)(?:ultrawork|ulw)\b/i;
const ULW_LOOP_DIR = ".omo/ulw-loop";
const BRIEF_FILE = "brief.md";
const STATE_FILE = "state.json";

export function isUltraworkPrompt(prompt: string): boolean {
  return ULTRAWORK_PATTERN.test(prompt);
}

export function shouldUseLightweightUltrawork(cwd: string, sessionId: string): boolean {
  return !hasFullUlwLoopPlan(cwd, sessionId);
}

export function extractUltraworkTask(prompt: string): string {
  const stripped = prompt
    .replace(/\/ulw-loop\b[^\n]*/gi, "")
    .replace(/\bultrawork\b/gi, "")
    .replace(/\bulw\b/gi, "")
    .trim();
  return stripped.length > 0 ? stripped : prompt.trim();
}

export function ultraworkDirective(task: string): string {
  return `<ultrawork-mode>
You are in **ULTRAWORK** mode (oh-my-openagent / omo-grok).

- Work until the task is fully complete — do not stop early.
- When done, output <promise>DONE</promise> then await verification.
- State persists under \`.omo/ulw-loop/\`.
- Cancel with: /cancel-ulw or "cancel ultrawork"

## Task
${task}
</ultrawork-mode>`;
}

export function activateUlwLoop(cwd: string, sessionId: string, task: string): void {
  const dir = join(cwd, ULW_LOOP_DIR, sanitizeSession(sessionId));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, STATE_FILE),
    JSON.stringify(
      {
        active: true,
        ultrawork: true,
        session_id: sessionId,
        iteration: 1,
        max_iterations: 500,
        task,
        started_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  writeFileSync(join(dir, BRIEF_FILE), `# ULW Loop Brief\n\n${task}\n`);
}

export function readUlwLoopState(cwd: string, sessionId: string): { active: boolean; task: string; iteration: number } | null {
  const statePath = join(cwd, ULW_LOOP_DIR, sanitizeSession(sessionId), STATE_FILE);
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record["active"] !== true) return null;
    return {
      active: true,
      task: typeof record["task"] === "string" ? record["task"] : "",
      iteration: typeof record["iteration"] === "number" ? record["iteration"] : 1,
    };
  } catch {
    return null;
  }
}

export function bumpUlwLoopIteration(cwd: string, sessionId: string): number {
  const statePath = join(cwd, ULW_LOOP_DIR, sanitizeSession(sessionId), STATE_FILE);
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return 1;
    const record = parsed as Record<string, unknown>;
    const next = (typeof record["iteration"] === "number" ? record["iteration"] : 0) + 1;
    record["iteration"] = next;
    writeFileSync(statePath, JSON.stringify(record, null, 2));
    return next;
  } catch {
    return 1;
  }
}

export function clearUlwLoop(cwd: string, sessionId: string): void {
  const statePath = join(cwd, ULW_LOOP_DIR, sanitizeSession(sessionId), STATE_FILE);
  try {
    const parsed: unknown = JSON.parse(readFileSync(statePath, "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      record["active"] = false;
      writeFileSync(statePath, JSON.stringify(record, null, 2));
    }
  } catch {
    // noop
  }
}

export function stopUlwLoopContinuation(
  cwd: string,
  sessionId: string,
  lastAssistantMessage: string,
): string | null {
  const state = readUlwLoopState(cwd, sessionId);
  if (state === null) return null;
  if (/<promise>\s*VERIFIED\s*<\/promise>/i.test(lastAssistantMessage)) {
    clearUlwLoop(cwd, sessionId);
    return null;
  }
  if (/<promise>\s*DONE\s*<\/promise>/i.test(lastAssistantMessage)) {
    return `[ULTRAWORK VERIFICATION]\nTask marked DONE. Run verification and emit <promise>VERIFIED</promise> before exit.\n\nOriginal task:\n${state.task}`;
  }
  const iteration = bumpUlwLoopIteration(cwd, sessionId);
  return `[ULTRAWORK LOOP ${iteration}/500]\nContinue working. Output <promise>DONE</promise> when complete.\n\nOriginal task:\n${state.task}`;
}

function sanitizeSession(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}