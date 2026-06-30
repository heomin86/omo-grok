import { hasFlag, readValue } from "./cli-arg-parser.js";
import { printJsonError, ULW_LOOP_HELP } from "./cli-output.js";
import {
	addGoal,
	captureEvidence,
	checkpoint,
	completeGoals,
	createGoals,
	criteria,
	grokGoalSnapshotRead,
	reviewBlockers,
	status,
	steer,
} from "./cli-subcommands.js";
import { resolveUlwLoopSessionIdFromEnv, type UlwLoopScope } from "./paths.js";
import { UlwLoopError } from "./types.js";

export const ULW_LOOP_SUBCOMMANDS = [
	"help",
	"create-goals",
	"status",
	"complete-goals",
	"checkpoint",
	"steer",
	"add-goal",
	"criteria",
	"record-evidence",
	"record-review-blockers",
	"grok-goal-snapshot",
] as const;

export type UlwLoopSubcommand = (typeof ULW_LOOP_SUBCOMMANDS)[number];

export function isUlwLoopSubcommand(value: string): value is UlwLoopSubcommand {
	return (ULW_LOOP_SUBCOMMANDS as readonly string[]).includes(value);
}

export async function ulwLoopCommand(argv: readonly string[]): Promise<number> {
	const head = argv[0] ?? "help";
	const command = head === "--help" || head === "-h" ? "help" : head;
	const rest = argv.slice(1);
	const repoRoot = process.cwd();
	const json = hasFlag(rest, "--json");
	const scope = commandScope(rest);
	try {
		if (!isUlwLoopSubcommand(command)) {
			if (json) {
				printJsonError(
					new UlwLoopError(`Unknown ulw-loop subcommand: ${command}.`, "ULW_LOOP_SUBCOMMAND_UNKNOWN", {
						details: { command },
					}),
				);
				return 1;
			}
			process.stdout.write(`${ULW_LOOP_HELP}\n`);
			return 1;
		}
		switch (command) {
			case "help":
				process.stdout.write(`${ULW_LOOP_HELP}\n`);
				return 0;
			case "create-goals":
				return await createGoals(repoRoot, rest, json, scope);
			case "status":
				return await status(repoRoot, json, scope);
			case "complete-goals":
				return await completeGoals(repoRoot, rest, json, scope);
			case "checkpoint":
				return await checkpoint(repoRoot, rest, json, scope);
			case "steer":
				return await steer(repoRoot, rest, json, scope);
			case "add-goal":
				return await addGoal(repoRoot, rest, json, scope);
			case "criteria":
				return await criteria(repoRoot, rest, json, scope);
			case "record-evidence":
				return await captureEvidence(repoRoot, rest, json, scope);
			case "record-review-blockers":
				return await reviewBlockers(repoRoot, rest, json, scope);
			case "grok-goal-snapshot":
				return await grokGoalSnapshotSubcommand(repoRoot, rest, json, scope);
			default:
				return unhandledSubcommand(command);
		}
	} catch (error) {
		if (json) {
			printJsonError(error);
			return 1;
		}
		if (error instanceof UlwLoopError) process.stderr.write(`[ulw-loop] ${error.message}\n`);
		else if (error instanceof Error) process.stderr.write(`[ulw-loop] unexpected: ${error.message}\n`);
		else process.stderr.write("[ulw-loop] unknown error\n");
		return 1;
	}
}

function unhandledSubcommand(command: never): never {
	throw new UlwLoopError(`Unhandled ulw-loop subcommand: ${String(command)}.`, "ULW_LOOP_SUBCOMMAND_UNHANDLED");
}

async function grokGoalSnapshotSubcommand(
	repoRoot: string,
	argv: readonly string[],
	json: boolean,
	scope?: UlwLoopScope,
): Promise<number> {
	const action = argv[0];
	if (action !== "read") {
		throw new UlwLoopError(
			"Unknown grok-goal-snapshot action; expected read.",
			"ULW_LOOP_GROK_GOAL_SNAPSHOT_ACTION_INVALID",
		);
	}
	return grokGoalSnapshotRead(repoRoot, argv.slice(1), json, scope);
}

function commandScope(argv: readonly string[]): UlwLoopScope | undefined {
	const sessionId = readValue(argv, "--session-id") ?? resolveUlwLoopSessionIdFromEnv();
	return sessionId === null ? undefined : { sessionId };
}
