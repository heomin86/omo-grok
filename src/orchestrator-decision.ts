import { runBoulderStopHook } from "./boulder-stop.js";
import { stopFullUlwLoopContinuation } from "./ulw-loop-grok.js";
import { stopUlwLoopContinuation } from "./ultrawork.js";

// Grok's Stop hook is passive (its stdout is ignored, so a `decision:block`
// cannot re-drive the agent). This mirrors the Stop-hook priority order but
// returns the continuation prompt to an external headless driver instead.
export async function computeNextPrompt(
  cwd: string,
  sessionId: string,
  lastAssistantMessage: string,
): Promise<string | null> {
  const full = await stopFullUlwLoopContinuation(cwd, sessionId);
  if (full !== null) return full;

  const ulw = stopUlwLoopContinuation(cwd, sessionId, lastAssistantMessage);
  if (ulw !== null) return ulw;

  return parseBoulderReason(runBoulderStopHook(cwd, sessionId, false));
}

function parseBoulderReason(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) return null;
    if (parsed["decision"] !== "block") return null;
    const reason = parsed["reason"];
    return typeof reason === "string" && reason.length > 0 ? reason : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
