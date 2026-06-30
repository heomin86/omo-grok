import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ultrawork", () => {
  it("activates ultrawork and persists .omo/ulw-loop state", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-ulw-"));
    temps.push(ws);
    const { stdout } = await runHook("user-prompt", {
      hookEventName: "UserPromptSubmit",
      sessionId: "test-ulw",
      workspaceRoot: ws,
      prompt: "ultrawork echo hello in temp file",
    });
    expect(stdout).toContain("ultrawork-mode");
    const statePath = join(ws, ".omo", "ulw-loop", "test-ulw", "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    expect(state.active).toBe(true);
    expect(state.ultrawork).toBe(true);
  });

  it("blocks Stop continuation for active ultrawork loop", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-stop-"));
    temps.push(ws);
    await runHook("user-prompt", {
      hookEventName: "UserPromptSubmit",
      sessionId: "test-stop",
      workspaceRoot: ws,
      prompt: "ultrawork fix lint",
    });
    const { stdout } = await runHook("stop", {
      hookEventName: "Stop",
      sessionId: "test-stop",
      workspaceRoot: ws,
      lastAssistantMessage: "still working",
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toContain("ULTRAWORK LOOP");
  });
});