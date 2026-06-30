import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE } from "../src/goal-status.js";
import { ulwLoopDir } from "../src/paths.js";
import { writePlan } from "../src/plan-io.js";
import { criterion, goal, plan } from "./fixtures/checkpoint-builders.js";

const componentRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const builtCli = join(componentRoot, "dist", "cli.js");

type CliResult = { code: number | null; stdout: string; stderr: string };

async function runCli(args: readonly string[], cwd: string): Promise<CliResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [builtCli, ...args], { cwd, env: process.env });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

const temps: string[] = [];

afterEach(async () => {
  for (const dir of temps.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function seedAggregateRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "grok-checkpoint-cli-"));
  temps.push(repo);
  await mkdir(ulwLoopDir(repo), { recursive: true });
  await writePlan(
    repo,
    plan(
      [
        goal({
          successCriteria: [
            criterion("C001", "pass", { essential: true }),
            criterion("C002", "pass", { essential: true }),
            criterion("C003", "pass", { essential: false }),
          ],
        }),
        goal({ id: "G002", status: "pending" }),
      ],
      { activeGoalId: "G001" },
    ),
  );
  return repo;
}

beforeAll(async () => {
  const build = await new Promise<CliResult>((resolvePromise, reject) => {
    const child = spawn("npm", ["run", "build"], { cwd: componentRoot, shell: true });
    const stderr: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code, stdout: "", stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
  expect(build.code, build.stderr).toBe(0);
}, 120_000);

describe("omo-grok-ulw-loop checkpoint --goal-runtime grok", () => {
  it("passes reconcile on matching active aggregate snapshot", async () => {
    const repo = await seedAggregateRepo();
    const grokJson = JSON.stringify({
      objective: ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE,
      status: "active",
    });

    const result = await runCli(
      [
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        "G001",
        "--status",
        "complete",
        "--evidence",
        "gate CLI pass: implementation and validation evidence",
        "--grok-goal-json",
        grokJson,
        "--json",
      ],
      repo,
    );

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as { ok: boolean; goal: { status: string } };
    expect(parsed.ok).toBe(true);
    expect(parsed.goal.status).toBe("complete");
  });

  it("fails reconcile with ulw_loop_grok_snapshot_mismatch on wrong objective", async () => {
    const repo = await seedAggregateRepo();
    const grokJson = JSON.stringify({
      objective: "WRONG aggregate objective for gate",
      status: "active",
    });

    const result = await runCli(
      [
        "checkpoint",
        "--goal-runtime",
        "grok",
        "--goal-id",
        "G001",
        "--status",
        "complete",
        "--evidence",
        "gate CLI mismatch evidence",
        "--grok-goal-json",
        grokJson,
        "--json",
      ],
      repo,
    );

    expect(result.code).toBe(1);
    const combined = `${result.stdout}${result.stderr}`;
    const parsed = JSON.parse(result.stdout.trim() || "{}") as {
      ok?: boolean;
      error?: { code?: string; message?: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error?.code).toBe("ulw_loop_grok_snapshot_mismatch");
    expect(combined).toMatch(/mismatch/i);
  });
});

describe("grok-goal-snapshot read via CLI", () => {
  it("reads objective from real goal/plan.md on disk", async () => {
    const repo = await mkdtemp(join(tmpdir(), "grok-plan-read-"));
    temps.push(repo);
    const sessionId = "gate-plan-read";
    const encoded = encodeURIComponent(repo);
    const planDir = join(
      process.env["HOME"] ?? "",
      ".grok",
      "sessions",
      encoded,
      sessionId,
      "goal",
    );
    await mkdir(planDir, { recursive: true });
    const objective = "Gate fixture plan objective from disk";
    await writeFile(
      join(planDir, "plan.md"),
      `# Plan: ${objective}\n\n## Acceptance criteria\n1. Read from disk\n`,
      "utf8",
    );

    const result = await runCli(
      [
        "grok-goal-snapshot",
        "read",
        "--session-id",
        sessionId,
        "--workspace-root",
        repo,
        "--json",
      ],
      repo,
    );

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as {
      ok: boolean;
      snapshot: { objective?: string; available: boolean };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.snapshot.available).toBe(true);
    expect(parsed.snapshot.objective).toBe(objective);

    const raw = await readFile(join(planDir, "plan.md"), "utf8");
    expect(raw).toContain(objective);
  });
});