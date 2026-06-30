import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function seedBoulderWorkspace(sessionId: string): string {
  const ws = mkdtempSync(join(tmpdir(), "omo-grok-boulder-"));
  temps.push(ws);
  mkdirSync(join(ws, ".omo", "plans"), { recursive: true });
  writeFileSync(
    join(ws, ".omo", "plans", "plan.md"),
    ["# Plan", "", "## TODOs", "- [ ] First task", "- [x] Done", "- [ ] Second task"].join("\n"),
  );
  writeFileSync(
    join(ws, ".omo", "boulder.json"),
    JSON.stringify({
      schema_version: 2,
      active_work_id: "work_1",
      works: {
        work_1: {
          work_id: "work_1",
          active_plan: ".omo/plans/plan.md",
          plan_name: "launch-plan",
          status: "active",
          started_at: "2026-06-13T00:00:00.000Z",
          session_ids: [`codex:${sessionId}`],
        },
      },
      active_plan: ".omo/plans/plan.md",
      plan_name: "legacy-launch-plan",
      started_at: "2026-06-13T00:00:00.000Z",
      status: "active",
      session_ids: [`codex:${sessionId}`],
    }),
  );
  return ws;
}

describe("boulder stop", () => {
  it("blocks Stop when boulder plan has remaining tasks (non-ulw)", async () => {
    const sessionId = "boulder-sess";
    const ws = seedBoulderWorkspace(sessionId);
    const { stdout } = await runHook("stop", {
      hookEventName: "Stop",
      sessionId,
      workspaceRoot: ws,
      lastAssistantMessage: "done for now",
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("start-work-continuation");
    expect(parsed.reason).toContain("Remaining top-level checkboxes: `2` of `3`");
    expect(parsed.reason).toContain("codex:boulder-sess");
  });
});