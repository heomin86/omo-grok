import { appendFileSync, mkdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

import {
  extractObjectiveFromPlanMarkdown,
  parseGrokGoalSnapshot,
  readGrokGoalPlanSnapshot,
  readGrokGoalSnapshotInput,
  reconcileGrokGoalSnapshot,
} from "../src/grok-goal-snapshot.js";

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe("parseGrokGoalSnapshot", () => {
  it("parses completed objective from JSON", () => {
    const snapshot = parseGrokGoalSnapshot({
      objective: "Ship ulw-loop Grok integration",
      completed: true,
    });
    expect(snapshot.available).toBe(true);
    expect(snapshot.objective).toBe("Ship ulw-loop Grok integration");
    expect(snapshot.status).toBe("complete");
    expect(snapshot.completed).toBe(true);
  });

  it("marks absent goals unavailable", () => {
    expect(parseGrokGoalSnapshot(null).available).toBe(false);
  });
});

describe("extractObjectiveFromPlanMarkdown", () => {
  it("reads objective from plan heading", () => {
    const objective = extractObjectiveFromPlanMarkdown(
      "# Plan: Port full ulw-loop into omo-grok\n\n## Acceptance criteria\n1. CLI works\n",
    );
    expect(objective).toBe("Port full ulw-loop into omo-grok");
  });
});

describe("reconcileGrokGoalSnapshot", () => {
  it("passes on exact objective match with completion", () => {
    const result = reconcileGrokGoalSnapshot(
      parseGrokGoalSnapshot({ objective: "Aggregate objective", completed: true }),
      {
        expectedObjective: "Aggregate objective",
        requireSnapshot: true,
        requireComplete: true,
      },
    );
    expect(result.ok).toBe(true);
  });

  it("fails on objective mismatch", () => {
    const result = reconcileGrokGoalSnapshot(
      parseGrokGoalSnapshot({ objective: "Wrong objective", completed: true }),
      {
        expectedObjective: "Expected objective",
        requireSnapshot: true,
        requireComplete: true,
      },
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("mismatch");
  });
});

describe("readGrokGoalPlanSnapshot on disk", () => {
  it("reads objective from a real goal/plan.md file", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "grok-plan-snap-"));
    temps.push(workspaceRoot);
    const sessionId = "test-session-plan";
    const planDir = join(
      process.env["HOME"] ?? "",
      ".grok",
      "sessions",
      encodeURIComponent(workspaceRoot),
      sessionId,
      "goal",
    );
    await mkdir(planDir, { recursive: true });
    const objective = "Ship Grok ulw-loop from real plan.md";
    await writeFile(join(planDir, "plan.md"), `# Plan: ${objective}\n`, "utf8");

    const snapshot = await readGrokGoalPlanSnapshot(workspaceRoot, sessionId);

    expect(snapshot?.available).toBe(true);
    expect(snapshot?.objective).toBe(objective);
    expect(snapshot?.planPath).toContain("goal/plan.md");
    expect(await readFile(join(planDir, "plan.md"), "utf8")).toContain(objective);

    mkdirSync(scratch, { recursive: true });
    appendFileSync(
      join(scratch, "grok-plan-read-from-test.log"),
      `=== readGrokGoalPlanSnapshot on disk ===\n${JSON.stringify(snapshot, null, 2)}\n`,
    );
  });
});

describe("readGrokGoalSnapshotInput", () => {
  it("reads objective from goal/plan.md via session context (no JSON arg)", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "grok-plan-input-"));
    temps.push(workspaceRoot);
    const sessionId = "gate-plan-input";
    const planDir = join(
      process.env["HOME"] ?? "",
      ".grok",
      "sessions",
      encodeURIComponent(workspaceRoot),
      sessionId,
      "goal",
    );
    await mkdir(planDir, { recursive: true });
    const objective = "Checkpoint reconcile reads this plan objective";
    await writeFile(join(planDir, "plan.md"), `# Plan: ${objective}\n\n## Acceptance criteria\n1. CLI checkpoint\n`, "utf8");

    const snapshot = await readGrokGoalSnapshotInput(undefined, workspaceRoot, {
      workspaceRoot,
      sessionId,
    });

    expect(snapshot?.available).toBe(true);
    expect(snapshot?.objective).toBe(objective);

    mkdirSync(scratch, { recursive: true });
    appendFileSync(
      join(scratch, "grok-plan-read-from-test.log"),
      `=== readGrokGoalSnapshotInput session plan.md ===\n${JSON.stringify(snapshot, null, 2)}\n`,
    );
  });

  it("parses JSON from a file path on disk", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "grok-snap-file-"));
    temps.push(cwd);
    const objective = "Snapshot from JSON file path";
    const path = join(cwd, "grok-snapshot.json");
    await writeFile(path, JSON.stringify({ objective, status: "active" }), "utf8");

    const snapshot = await readGrokGoalSnapshotInput(path, cwd);

    expect(snapshot?.objective).toBe(objective);
    expect(snapshot?.status).toBe("active");

    mkdirSync(scratch, { recursive: true });
    appendFileSync(
      join(scratch, "grok-snapshot-input-from-test.log"),
      `=== readGrokGoalSnapshotInput from file ===\n${JSON.stringify(snapshot, null, 2)}\n`,
    );
  });
});