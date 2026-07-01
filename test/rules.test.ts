import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("rules injection", () => {
  // Grok ignores SessionStart/UserPromptSubmit stdout, so static rules are
  // materialized into a managed block of AGENTS.md on SessionStart instead.
  it("materializes .omo/rules into AGENTS.md on SessionStart", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-rules-"));
    temps.push(ws);
    mkdirSync(join(ws, ".omo", "rules"), { recursive: true });
    mkdirSync(join(ws, ".git"));
    writeFileSync(
      join(ws, ".omo", "rules", "test.md"),
      "---\nalwaysApply: true\n---\n# Rule\nOMO_RULE_MARKER must appear.\n",
    );
    await runHook("session-start", {
      hookEventName: "SessionStart",
      sessionId: `test-rules-${Date.now()}`,
      workspaceRoot: ws,
    });
    const agentsPath = join(ws, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);
    const agents = readFileSync(agentsPath, "utf8");
    expect(agents).toContain("OMO_RULE_MARKER");
    expect(agents).toContain("omo-grok rules");
  });
});