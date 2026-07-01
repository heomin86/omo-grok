import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { computeNextPrompt } from "./orchestrator-decision.js";

export type GrokTurn = { text: string; sessionId: string; stopReason: string };

export type GrokInvokeArgs = {
  prompt: string;
  cwd: string;
  sessionId: string;
  mode: "new" | "resume";
  model?: string;
  effort?: string;
};

export type GrokInvoker = (args: GrokInvokeArgs) => Promise<GrokTurn>;

export type OrchestrationOptions = {
  cwd: string;
  initialPrompt: string;
  sessionId?: string;
  maxIterations?: number;
  model?: string;
  effort?: string;
  invoke?: GrokInvoker;
  onTurn?: (info: { iteration: number; turn: GrokTurn; nextPrompt: string | null }) => void;
};

export type OrchestrationResult = {
  sessionId: string;
  iterations: number;
  stopReason: "completed" | "max-iterations";
  lastText: string;
};

export async function orchestrate(options: OrchestrationOptions): Promise<OrchestrationResult> {
  const invoke = options.invoke ?? spawnGrok;
  const maxIterations = Math.max(1, options.maxIterations ?? 100);
  const sessionId = options.sessionId ?? randomUUID();
  const shared = { cwd: options.cwd, model: options.model, effort: options.effort };

  let turn = await invoke({ ...shared, prompt: options.initialPrompt, sessionId, mode: "new" });

  for (let iteration = 0; ; iteration += 1) {
    const nextPrompt = await computeNextPrompt(options.cwd, sessionId, turn.text);
    options.onTurn?.({ iteration, turn, nextPrompt });
    if (nextPrompt === null) {
      return { sessionId, iterations: iteration + 1, stopReason: "completed", lastText: turn.text };
    }
    if (iteration + 1 >= maxIterations) {
      return { sessionId, iterations: iteration + 1, stopReason: "max-iterations", lastText: turn.text };
    }
    turn = await invoke({ ...shared, prompt: nextPrompt, sessionId, mode: "resume" });
  }
}

async function spawnGrok(args: GrokInvokeArgs): Promise<GrokTurn> {
  const cliArgs = [
    "-p",
    args.prompt,
    "--yolo",
    "--output-format",
    "json",
    "--no-auto-update",
    "--cwd",
    args.cwd,
    args.mode === "new" ? "--session-id" : "--resume",
    args.sessionId,
  ];
  if (args.model !== undefined) cliArgs.push("-m", args.model);
  if (args.effort !== undefined) cliArgs.push("--effort", args.effort);

  const stdout = await runGrok(cliArgs, args.cwd);
  return parseTurn(stdout, args.sessionId);
}

function runGrok(cliArgs: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("grok", cliArgs, { cwd, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new Error(`grok exited with code ${String(code)}`));
    });
  });
}

export function parseTurn(stdout: string, fallbackSessionId: string): GrokTurn {
  const line = lastJsonLine(stdout);
  if (line === null) throw new Error("grok produced no JSON output");
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed)) throw new Error("grok output was not a JSON object");
  if (parsed["type"] === "error") {
    const message = parsed["message"];
    throw new Error(`grok error: ${typeof message === "string" ? message : "unknown"}`);
  }
  return {
    text: typeof parsed["text"] === "string" ? parsed["text"] : "",
    sessionId: typeof parsed["sessionId"] === "string" ? parsed["sessionId"] : fallbackSessionId,
    stopReason: typeof parsed["stopReason"] === "string" ? parsed["stopReason"] : "",
  };
}

function lastJsonLine(stdout: string): string | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"));
  return lines.length > 0 ? (lines[lines.length - 1] ?? null) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
