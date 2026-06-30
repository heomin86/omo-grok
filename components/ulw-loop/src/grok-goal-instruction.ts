import {
  codexGoalMode,
  expectedCodexObjective,
  isEssentialCriterion,
  isFinalRunCompletionCandidate,
} from "./goal-status.js";
import type { GoalRuntime } from "./goal-runtime.js";
import { buildCodexGoalInstruction, type UlwLoopGoalInstruction } from "./codex-goal-instruction.js";
import type { UlwLoopCodexGoalMode, UlwLoopItem, UlwLoopPlan, UlwLoopSuccessCriterion } from "./types.js";

export function buildPlatformGoalInstruction(args: {
  readonly plan: UlwLoopPlan;
  readonly goal: UlwLoopItem;
  readonly isFinal?: boolean;
  readonly runtime?: GoalRuntime;
}): UlwLoopGoalInstruction & { goalRuntime: GoalRuntime } {
  const runtime = args.runtime ?? "grok";
  if (runtime === "codex") {
    return { ...buildCodexGoalInstruction(args), goalRuntime: "codex" };
  }
  return { ...buildGrokGoalInstruction(args), goalRuntime: "grok" };
}

function buildGrokGoalInstruction(args: {
  readonly plan: UlwLoopPlan;
  readonly goal: UlwLoopItem;
  readonly isFinal?: boolean;
}): UlwLoopGoalInstruction {
  const mode = codexGoalMode(args.plan);
  const payload = { objective: expectedCodexObjective(args.plan, args.goal) };
  const isFinal = args.isFinal ?? isFinalRunCompletionCandidate(args.plan, args.goal);
  return {
    text: buildGrokText(mode, args.plan, args.goal, payload, isFinal),
    json: payload,
  };
}

function buildGrokText(
  mode: UlwLoopCodexGoalMode,
  plan: UlwLoopPlan,
  goal: UlwLoopItem,
  payload: { objective: string },
  isFinal: boolean,
): string {
  const sessionOpt = sessionOption(plan);
  return [
    mode === "aggregate" ? "UlwLoop aggregate-goal handoff (Grok)" : "UlwLoop active-goal handoff (Grok)",
    `Mode: ${mode}`,
    `Goal runtime: grok`,
    `Plan: ${plan.goalsPath}`,
    `Ledger: ${plan.ledgerPath}`,
    `Goal: ${goal.id} — ${goal.title}`,
    "",
    "Active goal:",
    `- id: ${goal.id}`,
    `- title: ${goal.title}`,
    `- objective: ${goal.objective}`,
    "",
    ...successCriteriaLines(goal.successCriteria),
    "",
    "Grok goal integration constraints:",
    "- If no active Grok goal exists, run `/goal <objective>` with the payload below (or ensure goal/plan.md objective matches).",
    "- Read goal state via goal/plan.md or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>`.",
    "- Goals are unlimited. Do not add numeric limits.",
    ...grokModeConstraintLines(mode, isFinal),
    grokFinalSection(plan, goal, isFinal, mode === "aggregate", sessionOpt),
    `- If blocked or failed, checkpoint with --status failed; rerun complete-goals${sessionOpt} --retry-failed to resume.`,
    "",
    "Grok /goal objective payload:",
    JSON.stringify(payload, null, 2),
  ].join("\n");
}

function grokModeConstraintLines(mode: UlwLoopCodexGoalMode, isFinal: boolean): string[] {
  if (mode === "per_story") {
    return [
      "- Read goal/plan.md. If no matching active goal, run `/goal <objective>`.",
      "- If a different active Grok goal exists, finish/checkpoint before starting this ulw-loop story.",
      "- Work only this goal until its completion audit passes.",
    ];
  }
  return [
    "- Grok /goal = the whole omo ulw-loop run; OMO G001/G002/etc. = ledger stories.",
    "- Read goal/plan.md. If no active goal, run `/goal` with the aggregate objective below.",
    "- If the active Grok goal objective matches the aggregate payload, continue without a new `/goal`.",
    isFinal
      ? "- This is the final story; call update_goal({completed: true, message}) only after the mandatory quality gate passes."
      : "- This is not the final story: do not call update_goal({completed: true}) mid-aggregate. Checkpoint this ledger story and continue remaining stories.",
  ];
}

function grokFinalSection(
  _plan: UlwLoopPlan,
  goal: UlwLoopItem,
  isFinal: boolean,
  aggregate: boolean,
  sessionOpt: string,
): string {
  if (!isFinal) {
    return "- This is not the final ulw-loop story; do not run the final quality gate yet.";
  }
  const blocker = `omo-grok-ulw-loop record-review-blockers${sessionOpt} --goal-id ${goal.id} --title "Resolve final review blockers" --objective "<blocker objective>" --evidence "<findings>" --grok-goal-json "<snapshot>" --goal-runtime grok`;
  const checkpoint = `omo-grok-ulw-loop checkpoint${sessionOpt} --goal-id ${goal.id} --status complete --evidence "<verification evidence>" --grok-goal-json '{"objective":"...","completed":true}' --goal-runtime grok`;
  return [
    "Final story — run mandatory quality gate before update_goal:",
    "- Run targeted verification for changed behavior.",
    "- Spawn final reviewers via Task/delegate_task.",
    "- If review is blocked, record blockers first:",
    `  ${blocker}`,
    aggregate
      ? "- If clean, call update_goal({completed: true, message: \"...\"}), then checkpoint:"
      : "- If clean, call update_goal({completed: true}), then checkpoint:",
    `  ${checkpoint}`,
    "- After aggregate completion, run `/goal clear` before starting another ulw-loop run.",
  ].join("\n");
}

function successCriteriaLines(criteria: readonly UlwLoopSuccessCriterion[]): string[] {
  if (criteria.length === 0) return ["Success criteria:", "- No success criteria recorded for this goal."];
  return [
    "Success criteria:",
    ...criteria.map((criterion) => {
      const marker = isEssentialCriterion(criterion) ? "essential" : "non-essential";
      const remaining = criterion.status === "pending" ? " remaining work:" : "";
      return `-${remaining} [${criterion.id}] [${marker}] (${criterion.userModel}) ${criterion.scenario} — expect: ${criterion.expectedEvidence} — status: ${criterion.status}`;
    }),
  ];
}

function sessionOption(plan: UlwLoopPlan): string {
  const prefix = ".omo/ulw-loop/";
  const suffix = "/goals.json";
  if (!plan.goalsPath.startsWith(prefix) || !plan.goalsPath.endsWith(suffix)) return "";
  const sessionId = plan.goalsPath.slice(prefix.length, -suffix.length);
  return sessionId.length === 0 ? "" : ` --session-id ${sessionId}`;
}