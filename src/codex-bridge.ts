import type { GrokHookEvent } from "./grok-io.js";

export function toCodexUserPrompt(event: GrokHookEvent) {
  return {
    hook_event_name: "UserPromptSubmit" as const,
    session_id: event.sessionId,
    turn_id: "grok-turn",
    transcript_path: null,
    cwd: event.workspaceRoot,
    model: "grok",
    permission_mode: "default",
    prompt: event.prompt ?? "",
  };
}

export function toCodexSessionStart(event: GrokHookEvent) {
  return {
    hook_event_name: "SessionStart" as const,
    session_id: event.sessionId,
    transcript_path: null,
    cwd: event.workspaceRoot,
    model: "grok",
    permission_mode: "default",
    source: "startup" as const,
  };
}

export function toCodexPostToolUse(event: GrokHookEvent) {
  return {
    hook_event_name: "PostToolUse" as const,
    session_id: event.sessionId,
    turn_id: "grok-turn",
    transcript_path: null,
    cwd: event.workspaceRoot,
    model: "grok",
    permission_mode: "default",
    tool_name: mapGrokToolName(event.toolName ?? ""),
    tool_input: event.toolInput ?? {},
    tool_response: event.toolResponse ?? "",
    tool_use_id: "grok-tool",
  };
}

export function toCodexStop(event: GrokHookEvent) {
  return {
    hook_event_name: "Stop" as const,
    session_id: event.sessionId,
    turn_id: "grok-turn",
    transcript_path: "/dev/null",
    cwd: event.workspaceRoot,
    model: "grok",
    permission_mode: "default",
    stop_hook_active: event.stopHookActive ?? false,
    last_assistant_message: event.lastAssistantMessage ?? "",
  };
}

function mapGrokToolName(toolName: string): string {
  const lower = toolName.toLowerCase();
  if (lower === "strreplace") return "edit";
  if (lower === "write") return "write";
  if (lower === "editnotebook") return "edit";
  return lower;
}