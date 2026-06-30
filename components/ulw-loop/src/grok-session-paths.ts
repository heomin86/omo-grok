import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function encodeGrokWorkspaceKey(workspaceRoot: string): string {
  return encodeURIComponent(workspaceRoot);
}

export function resolveGrokGoalPlanPath(workspaceRoot: string, sessionId: string): string {
  const encoded = encodeGrokWorkspaceKey(workspaceRoot);
  return join(homedir(), ".grok", "sessions", encoded, sessionId, "goal", "plan.md");
}

export function grokGoalPlanExists(workspaceRoot: string, sessionId: string): boolean {
  return existsSync(resolveGrokGoalPlanPath(workspaceRoot, sessionId));
}