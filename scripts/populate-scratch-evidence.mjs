#!/usr/bin/env node
/**
 * Standalone SCRATCH evidence population (full VP pipeline without recursive npm test).
 * Usage: SCRATCH=/path node scripts/populate-scratch-evidence.mjs
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { emitScratchEvidence } from "./scratch-evidence-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function must(label, result) {
  if (result.code !== 0) {
    process.stderr.write(`${label} failed\n${result.stdout}\n${result.stderr}\n`);
    process.exit(result.code || 1);
  }
}

try {
  emitScratchEvidence({
    scratch,
    root,
    generator: "scripts/populate-scratch-evidence.mjs",
    build: true,
    runVerifyGates: process.env.RUN_VERIFY_GATES !== "0",
  });

  const test1 = run(
    "npx",
    ["vitest", "--run", "--project", "omo-grok"],
    {
      cwd: root,
      shell: process.platform === "win32",
      env: {
        ...process.env,
        SCRATCH: scratch,
        RUN_VERIFY_GATES: "0",
        GROK_SKIP_PLUGIN_INSTALL: "1",
        GROK_PLUGIN_ROOT: process.env.GROK_PLUGIN_ROOT ?? root,
      },
    },
  );
  writeFileSync(join(scratch, "npm-test-run3.log"), `${test1.stdout}${test1.stderr}`);
  must("vitest run3", test1);

  const test2 = run(
    "npx",
    ["vitest", "--run", "--project", "omo-grok"],
    {
      cwd: root,
      shell: process.platform === "win32",
      env: {
        ...process.env,
        SCRATCH: scratch,
        RUN_VERIFY_GATES: "0",
        GROK_SKIP_PLUGIN_INSTALL: "1",
        GROK_PLUGIN_ROOT: process.env.GROK_PLUGIN_ROOT ?? root,
      },
    },
  );
  writeFileSync(join(scratch, "npm-test-run4.log"), `${test2.stdout}${test2.stderr}`);
  must("vitest run4", test2);

  appendFileSync(
    join(scratch, "SCRATCH_EVIDENCE_COMPLETE.txt"),
    "artifact=npm-test-run3.log\nartifact=npm-test-run4.log\n",
  );

  process.stdout.write(`POPULATE_SCRATCH_EVIDENCE_OK scratch=${scratch}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}