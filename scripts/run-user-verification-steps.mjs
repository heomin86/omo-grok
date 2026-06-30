#!/usr/bin/env node
/** Plan verification: populate SCRATCH evidence (manifest + CLI gates + verify-gates + vitest x2). */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

const env = {
  ...process.env,
  SCRATCH: scratch,
  GROK_SKIP_PLUGIN_INSTALL: "1",
  GROK_PLUGIN_ROOT: process.env.GROK_PLUGIN_ROOT ?? root,
  RUN_VERIFY_GATES: "1",
};

mkdirSync(scratch, { recursive: true });

const result = spawnSync(process.execPath, [join(root, "scripts", "populate-scratch-evidence.mjs")], {
  cwd: root,
  encoding: "utf8",
  env,
});
const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
writeFileSync(join(scratch, "run-user-verification.log"), combined);
process.stdout.write(combined);
process.exit(result.status ?? 1);