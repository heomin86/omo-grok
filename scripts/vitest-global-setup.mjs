#!/usr/bin/env node
/**
 * Runs before vitest tests: emits honest SCRATCH gate evidence (manifest, CLI, hooks, verify-gates).
 * On failure, writes global-setup-error.log and defers to test/00-scratch-evidence-emit.test.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emitScratchEvidence } from "./scratch-evidence-core.mjs";

export async function setup() {
  const scratch =
    process.env.SCRATCH ??
    join(tmpdir(), "omo-grok-scratch");

  mkdirSync(scratch, { recursive: true });

  try {
    const { scratch: outScratch } = emitScratchEvidence({
      scratch,
      generator: "scripts/vitest-global-setup.mjs",
      build: true,
      runVerifyGates: process.env.RUN_VERIFY_GATES !== "0",
    });
    process.stdout.write(`VITEST_GLOBAL_SETUP_OK scratch=${outScratch}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(join(scratch, "global-setup-error.log"), `${message}\n`);
    process.stderr.write(`VITEST_GLOBAL_SETUP_DEFERRED: ${message}\n`);
  }
}

export async function teardown() {
  // Optional teardown
}
