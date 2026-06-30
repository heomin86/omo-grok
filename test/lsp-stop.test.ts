import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
  delete process.env.OMO_LSP_MOCK_DIAG;
});

describe("lsp stop enforcement", () => {
  it("blocks Stop when LSP stash has errors", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-lsp-"));
    temps.push(ws);
    const home = mkdtempSync(join(tmpdir(), "omo-grok-home-lsp-"));
    temps.push(home);
    const sessionId = "lsp-stop-test";

    const target = join(ws, "bad.ts");
    writeFileSync(target, "const broken = ;\n", "utf8");

    process.env.OMO_LSP_MOCK_DIAG = "error[typescript] (1:16): Expression expected.";

    await runHook(
      "post-tool-lsp",
      {
        hookEventName: "PostToolUse",
        sessionId,
        workspaceRoot: ws,
        toolName: "StrReplace",
        toolInput: { path: "bad.ts" },
      },
      { home },
    );

    const { stdout } = await runHook(
      "stop",
      {
        hookEventName: "Stop",
        sessionId,
        workspaceRoot: ws,
        lastAssistantMessage: "done",
      },
      { home },
    );

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("block");
    expect(parsed.reason).toMatch(/LSP errors remain/i);
    expect(parsed.reason).toMatch(/bad\.ts/);
  });
});