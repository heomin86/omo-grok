import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { isRecord } from "@oh-my-opencode/comment-checker-core";

import type { CommentCheckRequest } from "./comment-checker-grok.js";

export type CheckerResult = {
  status: "pass" | "warn" | "missing" | "error";
  message: string;
  binaryPath?: string;
};

const COMMENT_CHECKER_PACKAGE = "@code-yeongyu/comment-checker";

export function resolveInstalledCommentCheckerBinary(): string | undefined {
  return resolveCommentCheckerBinary();
}

export function resolveCommentCheckerBinary(): string | undefined {
  const binaryName = process.platform === "win32" ? "comment-checker.exe" : "comment-checker";
  const fromPackageApi = resolvePackageApiBinary();
  if (fromPackageApi) return fromPackageApi;
  const fromPackage = resolvePackageBinary(binaryName);
  if (fromPackage) return fromPackage;
  return undefined;
}

function resolvePackageApiBinary(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const packageExports: unknown = require(COMMENT_CHECKER_PACKAGE);
    if (!isCommentCheckerPackage(packageExports)) return undefined;
    const binaryPath = packageExports.getBinaryPath();
    return existsSync(binaryPath) ? binaryPath : undefined;
  } catch {
    return undefined;
  }
}

function resolvePackageBinary(binaryName: string): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const packagePath = require.resolve(`${COMMENT_CHECKER_PACKAGE}/package.json`);
    const binaryPath = join(dirname(packagePath), "bin", binaryName);
    return existsSync(binaryPath) ? binaryPath : undefined;
  } catch {
    return undefined;
  }
}

function isCommentCheckerPackage(value: unknown): value is { getBinaryPath: () => string } {
  return isRecord(value) && typeof value["getBinaryPath"] === "function";
}

export async function runCommentCheckerForRequest(
  request: CommentCheckRequest,
  context: { sessionId: string; cwd: string },
): Promise<CheckerResult> {
  const binaryPath = resolveCommentCheckerBinary();
  if (!binaryPath) {
    return {
      status: "missing",
      message: "comment-checker binary not found. Run npm install in the omo-grok plugin directory.",
    };
  }

  const hookInput = {
    session_id: context.sessionId,
    tool_name: request.toolName,
    transcript_path: "",
    cwd: context.cwd,
    hook_event_name: "PostToolUse" as const,
    tool_input: request.toolInput,
  };

  const result = await spawnProcess(binaryPath, ["check"], JSON.stringify(hookInput));
  const message = result.stderr || result.stdout;
  if (result.exitCode === 0) {
    return { status: "pass", message: "", binaryPath };
  }
  if (result.exitCode === 2) {
    return { status: "warn", message, binaryPath };
  }
  return { status: "error", message, binaryPath };
}

export async function spawnProcess(
  command: string,
  args: string[],
  stdin: string,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });
    child.stdin.end(stdin);
    child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
    child.on("error", () => resolve({ exitCode: 1, stdout, stderr: "spawn failed" }));
  });
}

/** Test helper: confirm @code-yeongyu/comment-checker package resolves on disk */
export function commentCheckerPackageInstalled(): boolean {
  return resolveCommentCheckerBinary() !== undefined;
}