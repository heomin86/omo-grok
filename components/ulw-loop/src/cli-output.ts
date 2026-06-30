import type { UlwLoopCodexGoalMode, UlwLoopItem, UlwLoopPlan } from "./types.js";
import { UlwLoopError } from "./types.js";

export const ULW_LOOP_HELP = `Usage:
  omo-grok-ulw-loop create-goals --brief "..." [--goal-runtime grok|codex] [--goal-mode aggregate|per_story] [--force] [--json]
  omo-grok-ulw-loop status [--json]
  omo-grok-ulw-loop complete-goals [--retry-failed] [--goal-runtime grok] [--json]
  omo-grok-ulw-loop criteria --goal-id <id> [--json]
  omo-grok-ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status pass|fail|blocked --evidence "..." [--json]
  omo-grok-ulw-loop checkpoint --goal-id <id> --status complete|failed|blocked --evidence "..." [--grok-goal-json <...>] [--goal-runtime grok] [--json]
  omo-grok-ulw-loop steer --kind <kind> ... --evidence "..." --rationale "..." [--json]
  omo-grok-ulw-loop add-goal --title "..." --objective "..." [--json]
  omo-grok-ulw-loop record-review-blockers --goal-id <id> ... [--grok-goal-json <...>] [--goal-runtime grok] [--json]
  omo-grok-ulw-loop grok-goal-snapshot read [--session-id <id>] [--workspace-root <path>] [--json]

Default --goal-runtime is grok. Codex paths accept --codex-goal-json as an alias when --goal-runtime codex.
All subcommands accept [--session-id <id>] for isolated state under .omo/ulw-loop/<id>/.`;

type CriteriaCounts = { readonly pass: number; readonly total: number };

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printJsonError(error: unknown): void {
	if (error instanceof UlwLoopError) {
		printJson({
			ok: false,
			error: {
				code: error.code,
				message: error.message,
				...(error.details === undefined ? {} : { details: error.details }),
			},
		});
		return;
	}
	if (error instanceof Error) {
		printJson({ ok: false, error: { code: "ULW_LOOP_UNEXPECTED", message: error.message } });
		return;
	}
	printJson({ ok: false, error: { code: "ULW_LOOP_UNKNOWN", message: "unknown error" } });
}

function criteriaCounts(goal: UlwLoopItem): CriteriaCounts {
	let pass = 0;
	for (const criterion of goal.successCriteria) if (criterion.status === "pass") pass += 1;
	return { pass, total: goal.successCriteria.length };
}

export function printStatus(plan: UlwLoopPlan): void {
	let totalCriteria = 0;
	let passCriteria = 0;
	const lines = ["ulw-loop status", "", "goals:"];
	for (const goal of plan.goals) {
		const counts = criteriaCounts(goal);
		totalCriteria += counts.total;
		passCriteria += counts.pass;
		const marker = goal.id === plan.activeGoalId ? "*" : "-";
		lines.push(`${marker} ${goal.id} [${goal.status}] ${goal.title} (criteria: ${counts.pass}/${counts.total})`);
	}
	lines.push("", "summary:", `total goals: ${plan.goals.length}`, `criteria: ${passCriteria}/${totalCriteria} pass`);
	process.stdout.write(`${lines.join("\n")}\n`);
}

export function blockedDecisionHandoff(plan: UlwLoopPlan): string {
	const blocked = plan.goals.find((goal) => goal.status === "needs_user_decision" && goal.nonRetriable);
	if (blocked === undefined) return "";
	return [
		"ulw-loop: blocked on repeated external authorization; no retryable failed goals remain.",
		`Goal: ${blocked.id} - ${blocked.title}`,
		`Required external decision: ${blocked.requiredExternalDecision ?? "provide the missing authorization or choose a different unblock path"}.`,
		"Do not run complete-goals --retry-failed again until external state changes or the user authorizes an unblock path.",
	].join("\n");
}

export function normalizeCodexGoalMode(value: string | undefined): UlwLoopCodexGoalMode {
	return normalizeGoalMode(value);
}

export function normalizeGoalMode(value: string | undefined): UlwLoopCodexGoalMode {
	if (value === undefined) return "aggregate";
	if (value === "aggregate" || value === "per_story") return value;
	throw new UlwLoopError(
		"Invalid --goal-mode; expected aggregate or per_story.",
		"ULW_LOOP_GOAL_MODE_INVALID",
		{ details: { value } },
	);
}
