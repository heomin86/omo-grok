/**
 * First test file (00- prefix): ensures SCRATCH VP artifacts exist before audit tests run.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

function gatesReady(): boolean {
  const log = join(scratch, "verify-gates-stdout.log");
  return existsSync(log) && readFileSync(log, "utf8").includes("ALL_GATES_PASS");
}

beforeAll(async () => {
  if (gatesReady()) return;
  const { emitScratchEvidence } = await import("../scripts/scratch-evidence-core.mjs");
  emitScratchEvidence({
    scratch,
    root: repoRoot,
    generator: "test/00-scratch-evidence-emit.test.ts",
    build: false,
    runVerifyGates: process.env.RUN_VERIFY_GATES !== "0",
  });
}, 300_000);

describe("SCRATCH evidence emit (00)", () => {
  it("emits CHANGED_FILES_omo-grok.txt with sha256 fingerprints", () => {
    const path = join(scratch, "CHANGED_FILES_omo-grok.txt");
    expect(existsSync(path)).toBe(true);
    const manifest = readFileSync(path, "utf8");
    expect(manifest).toContain("sha256=");
    expect(manifest).toContain("grok-goal-snapshot.ts");
    expect(manifest).toContain("src/ulw-loop-grok.ts");
  });
});