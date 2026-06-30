export type GrokHookEvent = {
  hookEventName: string;
  sessionId: string;
  workspaceRoot: string;
  prompt?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: unknown;
  stopReason?: string;
  lastAssistantMessage?: string;
  stopHookActive?: boolean;
};

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseGrokEvent(raw: string): GrokHookEvent | null {
  if (raw.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const hookEventName = pickString(parsed, "hookEventName", "hook_event_name");
    const sessionId = pickString(parsed, "sessionId", "session_id");
    const workspaceRoot = pickString(parsed, "workspaceRoot", "workspace_root", "cwd");
    if (!hookEventName || !sessionId || !workspaceRoot) return null;
    return {
      hookEventName,
      sessionId,
      workspaceRoot,
      prompt: pickString(parsed, "prompt", "userPrompt", "message"),
      toolName: pickString(parsed, "toolName", "tool_name", "tool"),
      toolInput: pickMap(parsed, "toolInput", "tool_input", "input", "arguments", "rawInput"),
      toolResponse: parsed["toolResponse"] ?? parsed["tool_response"],
      stopReason: pickString(parsed, "stopReason", "stop_reason"),
      lastAssistantMessage: pickString(parsed, "lastAssistantMessage", "last_assistant_message"),
      stopHookActive: pickBool(parsed, "stopHookActive", "stop_hook_active"),
    };
  } catch {
    return null;
  }
}

export function emitAdditionalContext(parts: string[]): void {
  const merged = parts.map((p) => p.trim()).filter((p) => p.length > 0).join("\n\n");
  if (merged.length === 0) return;
  process.stdout.write(`${JSON.stringify({ additionalContext: merged })}\n`);
}

export function emitBlock(reason: string): void {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return;
  process.stdout.write(`${JSON.stringify({ decision: "block", reason: trimmed })}\n`);
}

export function emitDeny(reason: string): void {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return;
  process.stdout.write(`${JSON.stringify({ decision: "deny", reason: trimmed })}\n`);
}

export function unwrapCodexAdditionalContext(output: string): string {
  const trimmed = output.trim();
  if (trimmed.length === 0) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed.split("\n")[0] ?? trimmed);
    if (!isRecord(parsed)) return trimmed;
    const hookSpecific = parsed["hookSpecificOutput"];
    if (isRecord(hookSpecific) && typeof hookSpecific["additionalContext"] === "string") {
      return hookSpecific["additionalContext"];
    }
    if (typeof parsed["additionalContext"] === "string") return parsed["additionalContext"];
  } catch {
    return trimmed;
  }
  return "";
}

function pickString(m: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = m[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function pickBool(m: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = m[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function pickMap(m: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = m[key];
    if (isRecord(value)) return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}