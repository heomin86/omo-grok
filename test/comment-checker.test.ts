import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("comment-checker", () => {
  it("denies slop comments on search_replace via PreToolUse", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-cc-"));
    temps.push(ws);
    const { stdout } = await runHook("pre-tool-comment-checker", {
      hookEventName: "PreToolUse",
      sessionId: "test-cc",
      workspaceRoot: ws,
      toolName: "search_replace",
      toolInput: {
        path: "src/foo.ts",
        old_string: "const x = 1;",
        new_string: "// TODO: implement this properly\nconst x = 2;",
      },
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("deny");
    expect(parsed.reason).toMatch(/comment-checker|COMMENT\/DOCSTRING/i);
  });
});