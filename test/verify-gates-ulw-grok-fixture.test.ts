import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ulwCli = join(repoRoot, "components", "ulw-loop", "dist", "cli.js");
const seedScript = join(repoRoot, "scripts", "seed-ulw-grok-gate-fixture.mjs");
const scratch =
  process.env.SCRATCH ??
  join(tmpdir(), "omo-grok-scratch");
const scratchCheckpointLog = join(scratch, "checkpoint-grok-from-test.log");

function recordScratch(section: string, body: string): void {
  mkdirSync(scratch, { recursive: true });
  appendFileSync(scratchCheckpointLog, `=== ${section} ===\n${body}\n`);
}

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runNode(args: readonly string[], cwd: string): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function parseSeedExports(stdout: string): { aggregateObjective: string; goalId: string } {
  let aggregateObjective = "";
  let goalId = "";
  for (const line of stdout.split("\n")) {
    const objectiveMatch = line.match(/^export AGGREGATE_OBJECTIVE=(.+)$/);
    if (objectiveMatch) aggregateObjective = JSON.parse(objectiveMatch[1] ?? '""');
    const goalMatch = line.match(/^export GOAL_ID=(.+)$/);
    if (goalMatch) goalId = goalMatch[1] ?? "";
  }
  if (!aggregateObjective || !goalId) {
    throw new Error(`seed script missing exports:\n${stdout}`);
  }
  return { aggregateObjective, goalId };
}

afterAll(() => {
  if (!existsSync(scratchCheckpointLog)) return;
  mkdirSync(scratch, { recursive: true });
  writeFileSync(join(scratch, "checkpoint-grok-cli.log"), readFileSync(scratchCheckpointLog, "utf8"));
});

describe("verify-gates ulw-grok fixture (seed script + real CLI)", () => {
  it("checkpoint pass uses G001 + matching aggregate objective snapshot", () => {
    const ws = mkdtempSync(join(tmpdir(), "verify-gates-ulw-pass-"));
    temps.push(ws);

    const seed = runNode([seedScript, ws], repoRoot);
    expect(seed.code, seed.stderr).toBe(0);
    const { aggregateObjective, goalId } = parseSeedExports(seed.stdout);
    expect(goalId).toBe("G001");

    const goals = JSON.parse(readFileSync(join(ws, ".omo", "ulw-loop", "goals.json"), "utf8")) as {
      activeGoalId: string;
      goals: Array<{ id: string }>;
    };
    expect(goals.activeGoalId).toBe("G001");
    expect(goals.goals.some((goal) => goal.id === "G001")).toBe(true);

    const passSnapshot = JSON.stringify({ objective: aggregateObjective, status: "active" });
    const checkpoint = runNode(
      [
        ulwCli,
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        goalId,
        "--status",
        "complete",
        "--evidence",
        "verify-gates fixture pass evidence",
        "--grok-goal-json",
        passSnapshot,
        "--json",
      ],
      ws,
    );

    expect(checkpoint.code, `${checkpoint.stdout}\n${checkpoint.stderr}`).toBe(0);
    const parsed = JSON.parse(checkpoint.stdout.trim()) as { ok: boolean; goal: { id: string; status: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.goal.id).toBe("G001");
    expect(parsed.goal.status).toBe("complete");
    recordScratch(
      "checkpoint pass (G001 + matching aggregate snapshot)",
      `${checkpoint.stdout}${checkpoint.stderr}`,
    );
  });

  it("checkpoint mismatch returns ulw_loop_grok_snapshot_mismatch (not goal_not_found)", () => {
    const ws = mkdtempSync(join(tmpdir(), "verify-gates-ulw-mismatch-"));
    temps.push(ws);

    const seed = runNode([seedScript, ws], repoRoot);
    expect(seed.code, seed.stderr).toBe(0);
    const { goalId } = parseSeedExports(seed.stdout);

    const mismatchSnapshot = JSON.stringify({
      objective: "WRONG aggregate objective for verify-gates",
      status: "active",
    });
    const checkpoint = runNode(
      [
        ulwCli,
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        goalId,
        "--status",
        "complete",
        "--evidence",
        "verify-gates fixture mismatch evidence",
        "--grok-goal-json",
        mismatchSnapshot,
        "--json",
      ],
      ws,
    );

    expect(checkpoint.code).toBe(1);
    const parsed = JSON.parse(checkpoint.stdout.trim() || "{}") as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("ulw_loop_grok_snapshot_mismatch");
    expect(parsed.error?.code).not.toBe("ulw_loop_goal_not_found");
    expect(parsed.error?.message ?? "").toMatch(/mismatch/i);
    recordScratch(
      "checkpoint mismatch (ulw_loop_grok_snapshot_mismatch)",
      `${checkpoint.stdout}${checkpoint.stderr}`,
    );
  });
});