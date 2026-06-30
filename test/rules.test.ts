import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("rules injection", () => {
  it("injects .omo/rules on UserPromptSubmit", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-rules-"));
    temps.push(ws);
    mkdirSync(join(ws, ".omo", "rules"), { recursive: true });
    mkdirSync(join(ws, ".git"));
    writeFileSync(
      join(ws, ".omo", "rules", "test.md"),
      "---\nalwaysApply: true\n---\n# Rule\nOMO_RULE_MARKER must appear.\n",
    );
    const { stdout } = await runHook("user-prompt", {
      hookEventName: "UserPromptSubmit",
      sessionId: `test-rules-${Date.now()}`,
      workspaceRoot: ws,
      prompt: "hello",
    });
    expect(stdout).toContain("OMO_RULE_MARKER");
    expect(stdout).toContain("OMO_RULES");
  });
});