#!/usr/bin/env node
/**
 * Execute plan ## Verification plan steps 1–4 and write artifacts to SCRATCH.
 * Usage: SCRATCH=/path node scripts/run-verification-plan.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch =
  process.env.SCRATCH ??
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

mkdirSync(scratch, { recursive: true });

function run(label, cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", cwd: root, ...opts });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    process.stderr.write(`${label} failed (exit ${result.status})\n${combined}\n`);
    process.exit(result.status || 1);
  }
  return combined;
}

function runAllowFail(label, cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", cwd: root, ...opts });
  return {
    code: result.status ?? 1,
    combined: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

run("write-changed-files", process.execPath, [join(root, "scripts", "write-changed-files-manifest.mjs")], {
  env: { ...process.env, SCRATCH: scratch },
});

// Step 4a: npm test run 1
const test1 = runAllowFail("npm test run1", "npm", ["test"]);
writeFileSync(join(scratch, "npm-test-run3.log"), test1.combined);
if (test1.code !== 0) process.exit(test1.code);

// Step 4b: npm test run 2
const test2 = runAllowFail("npm test run2", "npm", ["test"]);
writeFileSync(join(scratch, "npm-test-run4.log"), test2.combined);
if (test2.code !== 0) process.exit(test2.code);

// Step 1–3: ulw-grok evidence (CLI + checkpoint + hooks)
run("capture-ulw-grok-evidence", process.execPath, [
  join(root, "scripts", "capture-ulw-grok-gate-evidence.mjs"),
], { env: { ...process.env, SCRATCH: scratch } });

// Step 4c: verify-gates
const gates = runAllowFail("verify-gates", "bash", [join(root, "scripts", "verify-gates.sh")], {
  env: {
    ...process.env,
    SCRATCH: scratch,
    GROK_SKIP_PLUGIN_INSTALL: "1",
    GROK_PLUGIN_ROOT: root,
  },
  shell: false,
});
const gatesLogPath = join(scratch, "verify-gates-stdout.log");
const gatesTranscript = existsSync(gatesLogPath)
  ? readFileSync(gatesLogPath, "utf8")
  : gates.combined;
writeFileSync(join(scratch, "verify-gates-ulw-grok.log"), gatesTranscript);
if (!gatesTranscript.includes("ALL_GATES_PASS")) {
  process.stderr.write("verify-gates missing ALL_GATES_PASS\n");
  process.exit(1);
}

// CHANGED_FILES sha256 manifest (omo-grok only — do not overwrite with find output)
run("write-changed-files-final", process.execPath, [join(root, "scripts", "write-changed-files-manifest.mjs")], {
  env: { ...process.env, SCRATCH: scratch },
});

process.stdout.write(`VERIFICATION_PLAN_OK scratch=${scratch}\n`);