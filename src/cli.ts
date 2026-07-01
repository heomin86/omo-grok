#!/usr/bin/env node
import { extractGrokCommentCheckRequests } from "./comment-checker-grok.js";
import { runCommentCheckerForRequest } from "./comment-checker-run.js";
import { runBoulderStopHook } from "./boulder-stop.js";
import {
  handlePostToolRead,
  updateHashlineCacheFromRead,
  validateHashlinePreTool,
} from "./hashline-grok.js";
import {
  evaluateLspStop,
  pluginRootFromEnv,
  updateLspStashFromPostTool,
} from "./lsp-stash.js";
import {
  emitAdditionalContext,
  emitBlock,
  emitDeny,
  parseGrokEvent,
  readStdin,
} from "./grok-io.js";
import { syncAgentsMdRules } from "./rules-inject.js";
import {
  applyFullUlwLoopSteering,
  evaluateUpdateGoalPreToolUse,
  maybeStartFullUlwLoopOnPrompt,
  stopFullUlwLoopContinuation,
} from "./ulw-loop-grok.js";
import {
  activateUlwLoop,
  clearUlwLoop,
  extractUltraworkTask,
  isUltraworkPrompt,
  shouldUseLightweightUltrawork,
  stopUlwLoopContinuation,
  ultraworkDirective,
} from "./ultrawork.js";

// omo-grok adapter entry — Grok hook dispatcher (verification stamp 2026-06-27)
async function main(): Promise<void> {
  const subcommand = process.argv[2];
  if (!subcommand) process.exit(0);
  const raw = await readStdin();
  const event = parseGrokEvent(raw);
  if (event === null) process.exit(0);

  switch (subcommand) {
    case "session-start":
      await handleSessionStart(event);
      break;
    case "user-prompt":
      await handleUserPrompt(event);
      break;
    case "pre-tool-hashline":
      await handlePreToolHashline(event);
      break;
    case "pre-tool-update-goal":
      await handlePreToolUpdateGoal(event);
      break;
    case "post-tool-read":
      await handlePostToolReadHook(event);
      break;
    case "post-tool-lsp":
      await handlePostToolLsp(event);
      break;
    case "pre-tool-comment-checker":
      await handleCommentChecker(event);
      break;
    case "stop":
      await handleStop(event);
      break;
    default:
      break;
  }
}

// Grok ignores SessionStart stdout, so static .omo rules are materialized into a
// managed block of the workspace AGENTS.md, which Grok does load into context.
async function handleSessionStart(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  try {
    syncAgentsMdRules(event.workspaceRoot);
  } catch {
    // fail-open: never block session start on rules materialization
  }
}

async function handleUserPrompt(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  const prompt = event.prompt ?? "";
  const parts: string[] = [];

  const steering = await applyFullUlwLoopSteering(event.workspaceRoot, event.sessionId, prompt);
  if (steering.length > 0) parts.push(steering);

  if (/cancel\s+ultrawork|\/cancel-ulw/i.test(prompt)) {
    clearUlwLoop(event.workspaceRoot, event.sessionId);
  } else if (isUltraworkPrompt(prompt) && shouldUseLightweightUltrawork(event.workspaceRoot, event.sessionId)) {
    const task = extractUltraworkTask(prompt);
    activateUlwLoop(event.workspaceRoot, event.sessionId, task);
    parts.push(ultraworkDirective(task));
  } else if (/\/ulw-loop\b/i.test(prompt) || /\bulw-loop\b/i.test(prompt)) {
    const handoff = await maybeStartFullUlwLoopOnPrompt(event.workspaceRoot, event.sessionId);
    if (handoff !== null) parts.push(handoff);
  }

  emitAdditionalContext(parts);
}

async function handlePreToolHashline(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  const reason = validateHashlinePreTool(event);
  if (reason !== null) emitDeny(reason);
}

async function handlePreToolUpdateGoal(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  const reason = await evaluateUpdateGoalPreToolUse(
    event.workspaceRoot,
    event.sessionId,
    event.toolInput,
  );
  if (reason !== null) emitDeny(reason);
}

async function handlePostToolReadHook(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  handlePostToolRead(event);
}

async function handlePostToolLsp(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  await updateLspStashFromPostTool(event, pluginRootFromEnv());
}

async function handleCommentChecker(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  const requests = extractGrokCommentCheckRequests(event);
  if (requests.length === 0) return;

  const warnings: string[] = [];
  for (const request of requests) {
    const result = await runCommentCheckerForRequest(request, {
      sessionId: event.sessionId,
      cwd: event.workspaceRoot,
    });
    if (result.status === "warn" && result.message.length > 0) {
      warnings.push(`comment-checker found issues in ${request.filePath}:\n${result.message}`);
    }
  }
  if (warnings.length > 0) emitDeny(warnings.join("\n\n"));
}

async function handleStop(event: Awaited<ReturnType<typeof parseGrokEvent>> & object): Promise<void> {
  if (event.stopHookActive) return;
  const last = event.lastAssistantMessage ?? "";

  const fullUlwReason = await stopFullUlwLoopContinuation(event.workspaceRoot, event.sessionId);
  if (fullUlwReason !== null) {
    emitBlock(fullUlwReason);
    return;
  }

  const ulwReason = stopUlwLoopContinuation(event.workspaceRoot, event.sessionId, last);
  if (ulwReason !== null) {
    emitBlock(ulwReason);
    return;
  }

  const lspReason = evaluateLspStop(event.sessionId);
  if (lspReason !== null) {
    emitBlock(lspReason);
    return;
  }

  const output = runBoulderStopHook(event.workspaceRoot, event.sessionId, event.stopHookActive ?? false);
  if (output.trim().length > 0) {
    const parsed: unknown = JSON.parse(output.trim());
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      if (record["decision"] === "block" && typeof record["reason"] === "string") {
        emitBlock(record["reason"]);
      }
    }
  }
}

export { injectStaticRules, syncAgentsMdRules } from "./rules-inject.js";
export { isUltraworkPrompt, stopUlwLoopContinuation } from "./ultrawork.js";
export { extractGrokCommentCheckRequests } from "./comment-checker-grok.js";
export { validateHashlinePreTool, updateHashlineCacheFromRead } from "./hashline-grok.js";
export { evaluateLspStop } from "./lsp-stash.js";

main().catch(() => process.exit(0));