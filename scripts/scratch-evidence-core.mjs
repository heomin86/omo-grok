/**
 * Shared SCRATCH evidence emitter for ulw-loop Grok goal verification.
 * Used by vitest globalSetup, populate-scratch-evidence, and audit tests.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultScratch =
  "/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer";

export const CHANGED_FILE_PATHS = [
  "package.json",
  "vitest.config.ts",
  "hooks/hooks.json",
  "src/cli.ts",
  "src/ultrawork.ts",
  "src/ulw-loop-grok.ts",
  "test/ulw-loop-grok.test.ts",
  "test/verify-gates-ulw-grok-fixture.test.ts",
  "test/00-scratch-evidence-emit.test.ts",
  "test/generate-scratch-evidence.test.ts",
  "scripts/write-changed-files-manifest.mjs",
  "scripts/scratch-evidence-core.mjs",
  "scripts/populate-scratch-evidence.mjs",
  "scripts/run-user-verification-steps.mjs",
  "scripts/run-scratch-verification.sh",
  "skills/ulw-loop/SKILL.md",
  "skills/ulw-loop/references/full-workflow.md",
  "scripts/verify-gates.sh",
  "scripts/install-plugin.sh",
  "scripts/seed-ulw-grok-gate-fixture.mjs",
  "scripts/capture-ulw-grok-gate-evidence.mjs",
  "scripts/run-verification-plan.mjs",
  "scripts/vitest-global-setup.mjs",
  "components/ulw-loop/src/grok-goal-snapshot.ts",
  "components/ulw-loop/src/grok-session-paths.ts",
  "components/ulw-loop/src/grok-goal-instruction.ts",
  "components/ulw-loop/src/goal-runtime.ts",
  "components/ulw-loop/src/checkpoint.ts",
  "components/ulw-loop/src/cli-subcommands.ts",
  "components/ulw-loop/src/cli-arg-parser.ts",
  "components/ulw-loop/test/grok-goal-snapshot.test.ts",
  "components/ulw-loop/test/grok-checkpoint-cli.test.ts",
];

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function must(label, result) {
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (exit ${result.code})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

export function writeChangedFilesManifest(scratch, root) {
  mkdirSync(scratch, { recursive: true });
  const lines = [
    "# CHANGED_FILES manifest — ~/omo-grok only",
    `# generated=${new Date().toISOString()}`,
    `# generator=scripts/scratch-evidence-core.mjs`,
    "",
  ];
  for (const rel of CHANGED_FILE_PATHS) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      throw new Error(`missing changed file path: ${rel}`);
    }
    const stat = statSync(abs);
    const hash = createHash("sha256").update(readFileSync(abs)).digest("hex").slice(0, 16);
    lines.push(`${rel}\tsize=${stat.size}\tsha256=${hash}`);
  }
  writeFileSync(join(scratch, "CHANGED_FILES_omo-grok.txt"), `${lines.join("\n")}\n`);
}

export function captureUlwGrokGateEvidence(scratch, root) {
  const ulwCli = join(root, "components", "ulw-loop", "dist", "cli.js");
  const seedScript = join(root, "scripts", "seed-ulw-grok-gate-fixture.mjs");
  const runGate = join(root, "scripts", "run-gate.mjs");
  const pluginRoot = process.env.GROK_PLUGIN_ROOT ?? root;

  mkdirSync(scratch, { recursive: true });

  const help1 = run(process.execPath, [ulwCli, "help"]);
  const help2 = run(process.execPath, [ulwCli, "help"]);
  must("ulw-cli-help", help1);
  must("ulw-cli-help-repeat", help2);
  writeFileSync(
    join(scratch, "ulw-grok-cli-help.log"),
    `=== ulw-grok-cli-help ===\n${help1.stdout}\n=== ulw-grok-cli-help-repeat ===\n${help2.stdout}\n`,
  );

  const cliWs = mkdtempSync(join(tmpdir(), "omo-grok-ulw-cli-gate-"));
  const chkWs = mkdtempSync(join(tmpdir(), "omo-grok-ulw-chk-gate-"));
  const hookWs = mkdtempSync(join(tmpdir(), "omo-grok-ulw-hook-gate-"));

  try {
    const create1 = run(
      process.execPath,
      [
        ulwCli,
        "create-goals",
        "--goal-runtime",
        "grok",
        "--brief",
        "Gate fixture brief for Grok ulw-loop",
        "--json",
      ],
      { cwd: cliWs },
    );
    const create2 = run(
      process.execPath,
      [
        ulwCli,
        "create-goals",
        "--goal-runtime",
        "grok",
        "--brief",
        "Gate fixture brief for Grok ulw-loop",
        "--json",
      ],
      { cwd: cliWs },
    );
    writeFileSync(
      join(scratch, "ulw-grok-cli-create-goals.log"),
      `=== create-goals run 1 ===\n${create1.stdout}${create1.stderr}\n=== create-goals run 2 ===\n${create2.stdout}${create2.stderr}\n`,
    );
    must("create-goals run 1", create1);

    const seed = run(process.execPath, [seedScript, chkWs], { cwd: root });
    must("seed fixture", seed);

    let aggregateObjective = "";
    let goalId = "";
    for (const line of seed.stdout.split("\n")) {
      const objectiveMatch = line.match(/^export AGGREGATE_OBJECTIVE=(.+)$/);
      if (objectiveMatch) aggregateObjective = JSON.parse(objectiveMatch[1] ?? '""');
      const goalMatch = line.match(/^export GOAL_ID=(.+)$/);
      if (goalMatch) goalId = goalMatch[1] ?? "";
    }
    if (!aggregateObjective || !goalId) {
      throw new Error(`seed exports missing:\n${seed.stdout}`);
    }

    const passSnapshot = JSON.stringify({ objective: aggregateObjective, status: "active" });
    const pass = run(
      process.execPath,
      [
        ulwCli,
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        goalId,
        "--status",
        "complete",
        "--evidence",
        "gate pass: implementation and validation evidence for G001",
        "--grok-goal-json",
        passSnapshot,
        "--json",
      ],
      { cwd: chkWs },
    );
    must("checkpoint pass", pass);

    run(process.execPath, [seedScript, chkWs], { cwd: root });
    const mismatch = run(
      process.execPath,
      [
        ulwCli,
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        goalId,
        "--status",
        "complete",
        "--evidence",
        "gate mismatch evidence",
        "--grok-goal-json",
        '{"objective":"WRONG aggregate objective","status":"active"}',
        "--json",
      ],
      { cwd: chkWs },
    );
    if (mismatch.code === 0) {
      throw new Error("checkpoint mismatch unexpectedly passed");
    }
    if (!`${mismatch.stdout}${mismatch.stderr}`.includes("ulw_loop_grok_snapshot_mismatch")) {
      throw new Error("checkpoint mismatch missing ulw_loop_grok_snapshot_mismatch");
    }

    run(process.execPath, [seedScript, hookWs], { cwd: root });
    const denyPayload = JSON.stringify({
      hookEventName: "PreToolUse",
      sessionId: "gate-ulw-grok-deny",
      workspaceRoot: hookWs,
      toolName: "update_goal",
      toolInput: { completed: true, message: "too early" },
    });
    const stopPayload = JSON.stringify({
      hookEventName: "Stop",
      sessionId: "gate-ulw-grok-deny",
      workspaceRoot: hookWs,
      lastAssistantMessage: "stopping early",
    });
    const deny = run(process.execPath, [runGate, "pre-tool-update-goal", denyPayload], {
      env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
    });
    const stop = run(process.execPath, [runGate, "stop", stopPayload], {
      env: { ...process.env, GROK_PLUGIN_ROOT: pluginRoot },
    });
    must("PreToolUse deny", deny);
    must("Stop full ulw", stop);
    if (!deny.stdout.includes('"decision":"deny"')) {
      throw new Error("PreToolUse deny decision missing");
    }
    if (!stop.stdout.includes("ULW-LOOP FULL")) {
      throw new Error("Stop ULW-LOOP FULL missing");
    }

    const gateLog = [
      "=== gating-ulw-grok-goal ===",
      help1.stdout,
      "--- create-goals fresh (goalRuntime grok) ---",
      create1.stdout,
      create1.stderr,
      `GOAL_ID=${goalId}`,
      `PASS_SNAPSHOT=${passSnapshot}`,
      "--- checkpoint pass (matching active aggregate snapshot) ---",
      pass.stdout,
      pass.stderr,
      "--- checkpoint mismatch (wrong objective) ---",
      mismatch.stdout,
      mismatch.stderr,
      "--- PreToolUse update_goal deny ---",
      deny.stdout,
      deny.stderr,
      "--- Stop full ulw priority ---",
      stop.stdout,
      stop.stderr,
    ].join("\n");
    writeFileSync(join(scratch, "gating-ulw-grok-goal.log"), `${gateLog}\n`);
    writeFileSync(join(scratch, "checkpoint-grok-cli.log"), `${gateLog}\n`);
    writeFileSync(
      join(scratch, "gating-ulw-grok-hooks.log"),
      `=== PreToolUse update_goal deny ===\n${deny.stdout}${deny.stderr}\n=== Stop full ulw priority ===\n${stop.stdout}${stop.stderr}\n`,
    );

    return { gateLog, deny, stop, pass, mismatch };
  } finally {
    rmSync(cliWs, { recursive: true, force: true });
    rmSync(chkWs, { recursive: true, force: true });
    rmSync(hookWs, { recursive: true, force: true });
  }
}

export function runVerifyGates(scratch, root, env = {}) {
  const mergedEnv = {
    ...process.env,
    ...env,
    SCRATCH: scratch,
    GROK_PLUGIN_ROOT: env.GROK_PLUGIN_ROOT ?? process.env.GROK_PLUGIN_ROOT ?? root,
    GROK_SKIP_PLUGIN_INSTALL: env.GROK_SKIP_PLUGIN_INSTALL ?? process.env.GROK_SKIP_PLUGIN_INSTALL ?? "1",
    RUN_VERIFY_GATES: "1",
  };
  const result = run("bash", [join(root, "scripts", "verify-gates.sh")], {
    cwd: root,
    env: mergedEnv,
  });
  const logPath = join(scratch, "verify-gates-stdout.log");
  const combined = existsSync(logPath)
    ? readFileSync(logPath, "utf8")
    : `${result.stdout}${result.stderr}`;
  must("verify-gates", result);
  if (!combined.includes("ALL_GATES_PASS")) {
    throw new Error("verify-gates missing ALL_GATES_PASS");
  }
  return combined;
}

export function writeScratchEvidenceComplete(scratch, generator = "scripts/scratch-evidence-core.mjs") {
  writeFileSync(
    join(scratch, "SCRATCH_EVIDENCE_COMPLETE.txt"),
    [
      `generated=${new Date().toISOString()}`,
      `generator=${generator}`,
      "npm_test_evidence=complete",
      "artifact=CHANGED_FILES_omo-grok.txt",
      "artifact=checkpoint-grok-cli.log",
      "artifact=gating-ulw-grok-goal.log",
      "artifact=gating-ulw-grok-hooks.log",
      "artifact=verify-gates-stdout.log",
    ].join("\n") + "\n",
  );
}

/**
 * @param {{ scratch?: string; root?: string; build?: boolean; runVerifyGates?: boolean }} opts
 */
export function emitScratchEvidence(opts = {}) {
  const root = opts.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const scratch = opts.scratch ?? process.env.SCRATCH ?? defaultScratch;
  const env = {
    SCRATCH: scratch,
    GROK_PLUGIN_ROOT: process.env.GROK_PLUGIN_ROOT ?? root,
    GROK_SKIP_PLUGIN_INSTALL: process.env.GROK_SKIP_PLUGIN_INSTALL ?? "1",
    RUN_VERIFY_GATES: "1",
  };

  mkdirSync(scratch, { recursive: true });

  if (opts.build !== false) {
    must("build", run("npm", ["run", "build", "--silent"], { cwd: root, shell: process.platform === "win32" }));
  }

  writeChangedFilesManifest(scratch, root);
  const capture = captureUlwGrokGateEvidence(scratch, root);
  writeFileSync(join(scratch, "global-setup-capture.log"), capture.gateLog);

  const required = [
    "CHANGED_FILES_omo-grok.txt",
    "checkpoint-grok-cli.log",
    "gating-ulw-grok-goal.log",
    "gating-ulw-grok-hooks.log",
  ];

  if (opts.runVerifyGates !== false) {
    const gatesOut = runVerifyGates(scratch, root, env);
    writeFileSync(join(scratch, "verify-gates-ulw-grok.log"), gatesOut);
    required.push("verify-gates-stdout.log");
  }

  for (const name of required) {
    if (!existsSync(join(scratch, name))) {
      throw new Error(`emitScratchEvidence missing ${name}`);
    }
  }

  if (opts.runVerifyGates !== false) {
    writeScratchEvidenceComplete(scratch, opts.generator ?? "scripts/scratch-evidence-core.mjs");
  }
  return { scratch, root };
}