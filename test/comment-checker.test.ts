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
  it("blocks slop comments on StrReplace", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-cc-"));
    temps.push(ws);
    const { stdout } = await runHook("post-tool-comment-checker", {
      hookEventName: "PostToolUse",
      sessionId: "test-cc",
      workspaceRoot: ws,
      toolName: "StrReplace",
      toolInput: {
        path: "src/foo.ts",
        old_string: "const x = 1;",
        new_string: "// TODO: implement this properly\nconst x = 2;",
      },
      toolResponse: "ok",
    });
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toMatch(/comment-checker|COMMENT\/DOCSTRING/i);
  });
});