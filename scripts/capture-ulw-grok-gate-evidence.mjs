#!/usr/bin/env node
/**
 * Node-only gate evidence capture (plan verification steps 1–3).
 * Usage: SCRATCH=/path node scripts/capture-ulw-grok-gate-evidence.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureUlwGrokGateEvidence } from "./scratch-evidence-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

const build = spawnSync("npm", ["run", "build", "--silent"], {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});
if ((build.status ?? 1) !== 0) {
  process.stderr.write(`build failed\n${build.stdout}${build.stderr}\n`);
  process.exit(build.status || 1);
}

try {
  captureUlwGrokGateEvidence(scratch, root);
  process.stdout.write(`ULW_GROK_GATE_EVIDENCE_OK scratch=${scratch}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}