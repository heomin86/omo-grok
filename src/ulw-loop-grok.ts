import { existsSync } from "node:fs";

import { applyUserPromptUlwLoopSteering } from "../components/ulw-loop/src/codex-hook.js";
import { buildPlatformGoalInstruction } from "../components/ulw-loop/src/grok-goal-instruction.js";
import {
  codexGoalMode,
  isFinalRunCompletionCandidate,
  isUlwLoopDone,
} from "../components/ulw-loop/src/goal-status.js";
import { type UlwLoopScope, ulwLoopGoalsPath } from "../components/ulw-loop/src/paths.js";
import { startNextUlwLoop, summarizeUlwLoopPlan } from "../components/ulw-loop/src/plan-crud.js";
import { readUlwLoopPlan } from "../components/ulw-loop/src/plan-io.js";

const UPDATE_GOAL_MID_AGGREGATE_REASON =
  "Do not call update_goal({completed:true}) mid-aggregate ulw-loop. Checkpoint the current ledger story, then continue remaining stories.";
const UPDATE_GOAL_NOT_FINAL_REASON =
  "update_goal({completed:true}) is reserved for the final ulw-loop story after the mandatory quality gate passes.";

export function ulwLoopScope(sessionId: string): UlwLoopScope {
  return { sessionId };
}

export function hasFullUlwLoopPlan(cwd: string, sessionId: string): boolean {
  return resolveUlwLoopReadScope(cwd, sessionId) !== null;
}

// Returns the session-scoped scope when a session plan exists, `undefined` for a
// workspace-global plan, and `null` when no ulw-loop plan is present at all.
export function resolveUlwLoopReadScope(cwd: string, sessionId: string): UlwLoopScope | null | undefined {
  if (existsSync(ulwLoopGoalsPath(cwd, ulwLoopScope(sessionId)))) return ulwLoopScope(sessionId);
  if (existsSync(ulwLoopGoalsPath(cwd))) return undefined;
  return null;
}

function isUpdateGoalCompletion(toolInput: Record<string, unknown> | undefined): boolean {
  if (toolInput === undefined) return false;
  if (toolInput["completed"] === true) return true;
  const status = toolInput["status"];
  return status === "complete" || status === "completed" || status === "done";
}

function activeGoal(plan: Awaited<ReturnType<typeof readUlwLoopPlan>>): (typeof plan.goals)[number] | undefined {
  const inProgress = plan.goals.find((goal) => goal.status === "in_progress");
  if (inProgress !== undefined) return inProgress;
  if (plan.activeGoalId !== undefined) {
    return plan.goals.find((goal) => goal.id === plan.activeGoalId);
  }
  return plan.goals.find((goal) => goal.status === "pending");
}

export async function evaluateUpdateGoalPreToolUse(
  cwd: string,
  sessionId: string,
  toolInput: Record<string, unknown> | undefined,
): Promise<string | null> {
  const scope = resolveUlwLoopReadScope(cwd, sessionId);
  if (scope === null) return null;
  if (!isUpdateGoalCompletion(toolInput)) return null;

  try {
    const plan = await readUlwLoopPlan(cwd, scope);
    if (isUlwLoopDone(plan)) return null;

    const goal = activeGoal(plan);
    if (goal === undefined) return null;
    if (isFinalRunCompletionCandidate(plan, goal)) return null;

    return codexGoalMode(plan) === "aggregate"
      ? UPDATE_GOAL_MID_AGGREGATE_REASON
      : UPDATE_GOAL_NOT_FINAL_REASON;
  } catch {
    return null;
  }
}

export async function applyFullUlwLoopSteering(
  cwd: string,
  sessionId: string,
  prompt: string,
): Promise<string> {
  if (!hasFullUlwLoopPlan(cwd, sessionId)) return "";
  const output = await applyUserPromptUlwLoopSteering({
    cwd,
    hook_event_name: "UserPromptSubmit",
    prompt,
    session_id: sessionId,
  });
  return output.trim();
}

function sessionFlag(sessionId: string): string {
  return ` --session-id ${sessionId}`;
}

export async function stopFullUlwLoopContinuation(
  cwd: string,
  sessionId: string,
): Promise<string | null> {
  const scope = resolveUlwLoopReadScope(cwd, sessionId);
  if (scope === null) return null;

  try {
    const plan = await readUlwLoopPlan(cwd, scope);
    if (isUlwLoopDone(plan)) return null;

    const summary = summarizeUlwLoopPlan(plan);
    const scopeSessionId = scope?.sessionId;
    const sessionOpt = typeof scopeSessionId === "string" ? sessionFlag(scopeSessionId) : "";
    const resume = `omo-grok-ulw-loop complete-goals${sessionOpt} --goal-runtime grok`;
    const active = plan.goals.find((goal) => goal.status === "in_progress");
    const handoff =
      active === undefined
        ? ""
        : buildPlatformGoalInstruction({ plan, goal: active, runtime: "grok" }).text;

    return [
      "[ULW-LOOP FULL]",
      `Pending ulw-loop plan at ${plan.goalsPath}.`,
      `Status: ${summary.in_progress} in progress, ${summary.pending} pending, ${summary.complete}/${summary.total} complete.`,
      `Resume with: ${resume}`,
      handoff.length > 0 ? `\nActive goal handoff:\n${handoff}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  } catch {
    return null;
  }
}

export async function maybeStartFullUlwLoopOnPrompt(
  cwd: string,
  sessionId: string,
): Promise<string | null> {
  const scope = resolveUlwLoopReadScope(cwd, sessionId);
  if (scope === null) return null;
  try {
    const result = await startNextUlwLoop(cwd, {}, scope);
    if ("done" in result) return null;
    return buildPlatformGoalInstruction({
      plan: result.plan,
      goal: result.goal,
      runtime: "grok",
    }).text;
  } catch {
    return null;
  }
}