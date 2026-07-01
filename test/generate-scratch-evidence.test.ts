/**
 * Emits then audits SCRATCH evidence for ulw-loop Grok goal verification.
 * beforeAll drives real CLI + verify-gates when globalSetup did not run (e.g. single-file vitest).
 */
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  join(tmpdir(), "omo-grok-scratch");

const requiredArtifacts = [
  "CHANGED_FILES_omo-grok.txt",
  "checkpoint-grok-cli.log",
  "gating-ulw-grok-goal.log",
  "gating-ulw-grok-hooks.log",
  "verify-gates-stdout.log",
  "SCRATCH_EVIDENCE_COMPLETE.txt",
] as const;

function readScratch(name: string): string {
  const path = join(scratch, name);
  expect(existsSync(path), `SCRATCH must contain ${name}`).toBe(true);
  return readFileSync(path, "utf8");
}

describe.sequential("SCRATCH evidence audit", () => {
  it("CHANGED_FILES_omo-grok.txt lists omo-grok paths with sha256 fingerprints", () => {
    const manifest = readScratch("CHANGED_FILES_omo-grok.txt");
    expect(manifest).toContain("sha256=");
    expect(manifest).toContain("grok-goal-snapshot.ts");
    expect(manifest).toContain("src/ulw-loop-grok.ts");
    expect(manifest).toContain("scripts/verify-gates.sh");
    expect(manifest).toContain("scripts/scratch-evidence-core.mjs");
    expect(manifest).not.toContain(".birdclaw");
    expect(manifest).not.toContain("Obsidian");
  });

  it("checkpoint-grok-cli.log captures pass ok:true and mismatch error", () => {
    const log = readScratch("checkpoint-grok-cli.log");
    expect(log).toContain('"ok": true');
    expect(log).toContain('"status": "complete"');
    expect(log).toContain("ulw_loop_grok_snapshot_mismatch");
    expect(log).toContain("G001");
  });

  it("gating-ulw-grok-goal.log includes verify-gates bash observables", () => {
    const log = readScratch("gating-ulw-grok-goal.log");
    expect(log).toContain("=== gating-ulw-grok-goal ===");
    expect(log).toContain('"ok": true');
    expect(log).toContain("ulw_loop_grok_snapshot_mismatch");
    expect(log).toContain('"decision":"deny"');
    expect(log).toContain("mid-aggregate");
    expect(log).toContain("ULW-LOOP FULL");
  });

  it("gating-ulw-grok-hooks.log captures PreToolUse deny and Stop priority", () => {
    const log = readScratch("gating-ulw-grok-hooks.log");
    expect(log).toContain('"decision":"deny"');
    expect(log).toContain("mid-aggregate");
    expect(log).toContain("ULW-LOOP FULL");
  });

  it("verify-gates-stdout.log reaches ALL_GATES_PASS with ulw-grok section", () => {
    const log = readScratch("verify-gates-stdout.log");
    expect(log).toContain("ALL_GATES_PASS");
    expect(log).toContain("gating-ulw-grok-goal");
    expect(log).toContain("omo-grok-ulw-loop");
  });

  it("SCRATCH_EVIDENCE_COMPLETE marker lists all VP artifacts", () => {
    const marker = readScratch("SCRATCH_EVIDENCE_COMPLETE.txt");
    expect(marker).toContain("npm_test_evidence=complete");
    for (const name of requiredArtifacts) {
      if (name === "SCRATCH_EVIDENCE_COMPLETE.txt") continue;
      expect(marker).toContain(`artifact=${name}`);
    }
  });
});