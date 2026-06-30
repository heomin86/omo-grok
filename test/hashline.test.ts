import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { computeLineHash } from "@oh-my-opencode/hashline-core";

import { runHook } from "./helpers/run-hook.js";

const temps: string[] = [];
const sessionId = "hashline-test-session";

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("hashline", () => {
  it("caches line hashes on Read and denies stale LINE#ID on StrReplace", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-hashline-"));
    temps.push(ws);
    const home = mkdtempSync(join(tmpdir(), "omo-grok-home-hl-"));
    temps.push(home);

    const target = join(ws, "foo.ts");
    writeFileSync(target, "const x = 1;\n", "utf8");

    await runHook(
      "post-tool-read",
      {
        hookEventName: "PostToolUse",
        sessionId,
        workspaceRoot: ws,
        toolName: "Read",
        toolInput: { path: "foo.ts" },
      },
      { home },
    );

    const cachePath = join(home, "state", "hashline", sessionId, `${createHash("sha256").update(target).digest("hex")}.json`);
    const cache = JSON.parse(readFileSync(cachePath, "utf8")) as { lines: Record<string, string> };
    const staleHash = cache.lines["1"];
    expect(staleHash).toBeTruthy();

    writeFileSync(target, "const x = 2;\n", "utf8");

    await runHook(
      "post-tool-read",
      {
        hookEventName: "PostToolUse",
        sessionId,
        workspaceRoot: ws,
        toolName: "Read",
        toolInput: { path: "foo.ts" },
      },
      { home },
    );

    const { stdout } = await runHook(
      "pre-tool-hashline",
      {
        hookEventName: "PreToolUse",
        sessionId,
        workspaceRoot: ws,
        toolName: "StrReplace",
        toolInput: {
          path: "foo.ts",
          old_string: `1#${staleHash}`,
          new_string: "const x = 3;\n",
        },
      },
      { home },
    );

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.decision).toBe("deny");
    expect(parsed.reason).toMatch(/stale LINE#ID/i);
  });

  it("allows StrReplace when LINE#ID matches cache", async () => {
    const ws = mkdtempSync(join(tmpdir(), "omo-grok-hashline-ok-"));
    temps.push(ws);
    const home = mkdtempSync(join(tmpdir(), "omo-grok-home-hl2-"));
    temps.push(home);
    writeFileSync(join(ws, "bar.ts"), "let y = 0;\n", "utf8");
    const hash = computeLineHash(1, "let y = 0;");

    await runHook(
      "post-tool-read",
      {
        hookEventName: "PostToolUse",
        sessionId: "hashline-allow",
        workspaceRoot: ws,
        toolName: "Read",
        toolInput: { path: "bar.ts" },
      },
      { home },
    );

    const { stdout } = await runHook(
      "pre-tool-hashline",
      {
        hookEventName: "PreToolUse",
        sessionId: "hashline-allow",
        workspaceRoot: ws,
        toolName: "StrReplace",
        toolInput: { path: "bar.ts", old_string: `1#${hash}`, new_string: "let y = 1;\n" },
      },
      { home },
    );
    expect(stdout.trim()).toBe("");
  });
});