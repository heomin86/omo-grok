import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync, writeFileSync as writeScratch } from "node:fs";
import { mkdirSync as mkdirScratch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const scratch =
  process.env.SCRATCH ??
  join(tmpdir(), "omo-grok-scratch");
const hookEvidenceParts: string[] = [];

import { evaluateUpdateGoalPreToolUse, hasFullUlwLoopPlan } from "../src/ulw-loop-grok.js";
import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
  if (hookEvidenceParts.length === 0) return;
  mkdirScratch(scratch, { recursive: true });
  writeScratch(join(scratch, "gating-ulw-grok-hooks.log"), hookEvidenceParts.join("\n"));
});

function seedAggregatePlan(ws: string): void {
  const dir = join(ws, ".omo", "ulw-loop");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "goals.json"),
    JSON.stringify(
      {
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        briefPath: ".omo/ulw-loop/brief.md",
        goalsPath: ".omo/ulw-loop/goals.json",
        ledgerPath: ".omo/ulw-loop/ledger.jsonl",
        codexGoalMode: "aggregate",
        codexObjective: "Complete the durable ulw-loop plan in .omo/ulw-loop/goals.json",
        activeGoalId: "G001",
        goals: [
          {
            id: "G001",
            title: "Story one",
            objective: "First story",
            status: "in_progress",
            successCriteria: [],
            attempt: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "G002",
            title: "Story two",
            objective: "Final story",
            status: "pending",
            successCriteria: [],
            attempt: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    ),
  );
}

describe("ulw-loop-grok hooks", () => {
  it("detects full ulw-loop goals.json", () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-full-ulw-"));
    temps.push(ws);
    seedAggregatePlan(ws);
    expect(hasFullUlwLoopPlan(ws, "session-1")).toBe(true);
  });

  it("blocks update_goal completed:true mid-aggregate", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-deny-"));
    temps.push(ws);
    seedAggregatePlan(ws);
    const reason = await evaluateUpdateGoalPreToolUse(ws, "session-1", { completed: true });
    expect(reason).toContain("mid-aggregate");
  });

  it("emits deny via pre-tool-update-goal hook", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-hook-deny-"));
    temps.push(ws);
    seedAggregatePlan(ws);
    const { stdout } = await runHook("pre-tool-update-goal", {
      hookEventName: "PreToolUse",
      sessionId: "session-1",
      workspaceRoot: ws,
      toolName: "update_goal",
      toolInput: { completed: true, message: "done early" },
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("deny");
    expect(parsed.reason).toContain("mid-aggregate");
    hookEvidenceParts.push(`=== PreToolUse update_goal deny ===\n${stdout}`);
  });

  it("prioritizes full ulw-loop on Stop over lightweight ultrawork", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-stop-priority-"));
    temps.push(ws);
    seedAggregatePlan(ws);
    await runHook("user-prompt", {
      hookEventName: "UserPromptSubmit",
      sessionId: "session-1",
      workspaceRoot: ws,
      prompt: "ultrawork should not win",
    });
    const { stdout } = await runHook("stop", {
      hookEventName: "Stop",
      sessionId: "session-1",
      workspaceRoot: ws,
      lastAssistantMessage: "stopping",
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("ULW-LOOP FULL");
    expect(parsed.reason).not.toContain("ULTRAWORK LOOP");
    hookEvidenceParts.push(`=== Stop full ulw priority ===\n${stdout}`);
  });
});