import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveGrokGoalPlanPath } from "./grok-session-paths.js";

export type GrokGoalSnapshotStatus = "active" | "complete" | "blocked" | "unknown";

export interface GrokGoalSnapshot {
  available: boolean;
  objective?: string;
  status?: GrokGoalSnapshotStatus;
  planPath?: string;
  completed?: boolean;
  message?: string;
  blocked_reason?: string;
  raw: unknown;
}

export interface GrokGoalReconciliation {
  ok: boolean;
  snapshot: GrokGoalSnapshot;
  warnings: string[];
  errors: string[];
}

export interface ReconcileGrokGoalOptions {
  expectedObjective: string;
  acceptedObjectives?: readonly string[];
  allowedStatuses?: readonly GrokGoalSnapshotStatus[];
  requireSnapshot?: boolean;
  requireComplete?: boolean;
}

export class GrokGoalSnapshotError extends Error {}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown, completed?: boolean): GrokGoalSnapshotStatus {
  if (completed === true) return "complete";
  const blocked = safeString(value).toLowerCase();
  if (blocked && /blocked/.test(blocked)) return "blocked";
  const status = safeString(value).toLowerCase();
  if (status === "complete" || status === "completed" || status === "done") return "complete";
  if (status === "blocked") return "blocked";
  if (status === "active" || status === "in_progress" || status === "pending" || status === "running") {
    return "active";
  }
  return "unknown";
}

function normalizeObjective(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractObjectiveFromPlanMarkdown(content: string): string | undefined {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (/^#\s*plan:/i.test(line)) {
      return normalizeObjective(line.replace(/^#\s*plan:\s*/i, ""));
    }
    if (/^##\s*goal\b/i.test(line)) {
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith("#")) return normalizeObjective(next);
    }
  }
  const acceptance = content.match(/##\s*Acceptance criteria[\s\S]*?(?=##|$)/i);
  if (acceptance) {
    const first = acceptance[0].split("\n").find((l) => /^\d+\./.test(l.trim()));
    if (first) return normalizeObjective(first.replace(/^\d+\.\s*/, ""));
  }
  return undefined;
}

export function parseGrokGoalSnapshot(value: unknown): GrokGoalSnapshot {
  const root = safeObject(value);
  const goalValue = Object.hasOwn(root, "goal") ? root["goal"] : value;
  if (goalValue === null || goalValue === undefined || goalValue === false) {
    return { available: false, raw: value };
  }

  const goal = safeObject(goalValue);
  const completed =
    goal["completed"] === true ||
    root["completed"] === true ||
    normalizeStatus(goal["status"] ?? root["status"]) === "complete";
  const objective = safeString(
    goal["objective"] ?? goal["goal"] ?? goal["description"] ?? root["objective"] ?? root["message"],
  );
  const status = normalizeStatus(goal["status"] ?? root["status"], completed);
  const planPath = safeString(goal["planPath"] ?? root["planPath"]);

  return {
    available: Boolean(objective || status !== "unknown" || completed),
    ...(objective ? { objective } : {}),
    status,
    ...(planPath ? { planPath } : {}),
    ...(completed ? { completed: true } : {}),
    ...(safeString(goal["message"] ?? root["message"]) ? { message: safeString(goal["message"] ?? root["message"]) } : {}),
    ...(safeString(goal["blocked_reason"] ?? root["blocked_reason"])
      ? { blocked_reason: safeString(goal["blocked_reason"] ?? root["blocked_reason"]) }
      : {}),
    raw: value,
  };
}

export async function readGrokGoalPlanSnapshot(
  workspaceRoot: string,
  sessionId: string,
): Promise<GrokGoalSnapshot | null> {
  const planPath = resolveGrokGoalPlanPath(workspaceRoot, sessionId);
  if (!existsSync(planPath)) return null;
  try {
    const content = await readFile(planPath, "utf8");
    const objective = extractObjectiveFromPlanMarkdown(content);
    if (!objective) return { available: false, planPath, raw: { planPath, contentLength: content.length } };
    return {
      available: true,
      objective,
      status: "active",
      planPath,
      raw: { planPath, objective },
    };
  } catch {
    return null;
  }
}

export async function readGrokGoalSnapshotInput(
  raw: string | undefined,
  cwd = process.cwd(),
  sessionContext?: { workspaceRoot: string; sessionId: string },
): Promise<GrokGoalSnapshot | null> {
  if (raw?.trim()) {
    const trimmed = raw.trim();
    try {
      return parseGrokGoalSnapshot(JSON.parse(trimmed));
    } catch {
      const path = resolve(cwd, trimmed);
      if (!existsSync(path)) {
        throw new GrokGoalSnapshotError(
          `Grok goal snapshot is neither valid JSON nor a readable path: ${trimmed}`,
        );
      }
      try {
        return parseGrokGoalSnapshot(JSON.parse(await readFile(path, "utf8")));
      } catch (error) {
        throw new GrokGoalSnapshotError(
          `Grok goal snapshot path does not contain valid JSON: ${trimmed}${error instanceof Error ? ` (${error.message})` : ""}`,
        );
      }
    }
  }

  if (sessionContext) {
    return readGrokGoalPlanSnapshot(sessionContext.workspaceRoot, sessionContext.sessionId);
  }

  return null;
}

export function reconcileGrokGoalSnapshot(
  snapshot: GrokGoalSnapshot | null | undefined,
  options: ReconcileGrokGoalOptions,
): GrokGoalReconciliation {
  const effectiveSnapshot = snapshot ?? { available: false, raw: null };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!effectiveSnapshot.available) {
    const message =
      "Grok goal snapshot is absent; pass --grok-goal-json, read goal/plan.md, or run grok-goal-snapshot read.";
    if (options.requireSnapshot) errors.push(message);
    else warnings.push(message);
    return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
  }

  const expected = normalizeObjective(options.expectedObjective);
  const accepted = new Set(
    [expected, ...(options.acceptedObjectives ?? []).map((objective) => normalizeObjective(objective))].filter(Boolean),
  );
  const actual = normalizeObjective(effectiveSnapshot.objective ?? "");
  if (!actual) {
    errors.push("Grok goal snapshot is missing objective text.");
  } else if (!accepted.has(actual)) {
    errors.push(`Grok goal objective mismatch: expected "${expected}", got "${actual}".`);
  }

  const allowed = options.allowedStatuses ?? (options.requireComplete ? ["complete"] : ["active", "complete"]);
  const actualStatus =
    effectiveSnapshot.completed === true ? "complete" : (effectiveSnapshot.status ?? "unknown");
  if (!allowed.includes(actualStatus)) {
    errors.push(`Grok goal status mismatch: expected ${allowed.join(" or ")}, got ${actualStatus}.`);
  }
  if (options.requireComplete && actualStatus !== "complete") {
    errors.push(
      'Grok goal is not complete; call update_goal({completed: true, message: "..."}) only after the objective is actually complete, then pass the fresh snapshot JSON.',
    );
  }

  return { ok: errors.length === 0, snapshot: effectiveSnapshot, warnings, errors };
}

export function formatGrokGoalReconciliation(reconciliation: GrokGoalReconciliation): string {
  return [...reconciliation.errors, ...reconciliation.warnings].join(" ");
}