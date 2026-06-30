import {
  formatCodexGoalReconciliation,
  type CodexGoalReconciliation,
  type CodexGoalSnapshot,
  type CodexGoalSnapshotStatus,
  readCodexGoalSnapshotInput,
  reconcileCodexGoalSnapshot,
} from "./codex-goal-snapshot.js";
import {
  formatGrokGoalReconciliation,
  type GrokGoalReconciliation,
  type GrokGoalSnapshot,
  type GrokGoalSnapshotStatus,
  readGrokGoalSnapshotInput,
  reconcileGrokGoalSnapshot,
} from "./grok-goal-snapshot.js";

export type GoalRuntime = "codex" | "grok";

export type PlatformGoalSnapshotStatus = CodexGoalSnapshotStatus | GrokGoalSnapshotStatus;

export interface PlatformGoalReconciliation {
  ok: boolean;
  snapshot: { available: boolean; objective?: string; status?: string; raw: unknown };
  warnings: string[];
  errors: string[];
}

export interface ReconcilePlatformGoalOptions {
  expectedObjective: string;
  acceptedObjectives?: readonly string[];
  allowedStatuses?: readonly string[];
  requireSnapshot?: boolean;
  requireComplete?: boolean;
}

export function resolveGoalRuntime(value: string | undefined): GoalRuntime {
  const normalized = (value ?? "grok").trim().toLowerCase();
  if (normalized === "codex") return "codex";
  return "grok";
}

export function goalRuntimeFromArgv(argv: readonly string[], readValue: (argv: readonly string[], flag: string) => string | undefined): GoalRuntime {
  return resolveGoalRuntime(readValue(argv, "--goal-runtime"));
}

export async function parsePlatformGoalJson(
  runtime: GoalRuntime,
  value: string | undefined,
  cwd: string,
  sessionContext?: { workspaceRoot: string; sessionId: string },
): Promise<string | undefined> {
  if (value === undefined) return undefined;
  if (runtime === "grok") {
    const snapshot = await readGrokGoalSnapshotInput(value, cwd, sessionContext);
    return snapshot === null ? undefined : JSON.stringify(snapshot.raw ?? snapshot);
  }
  const snapshot = await readCodexGoalSnapshotInput(value, cwd);
  return snapshot === null ? undefined : JSON.stringify(snapshot.raw ?? snapshot);
}

export async function readPlatformGoalSnapshot(
  runtime: GoalRuntime,
  raw: string | undefined,
  cwd: string,
  sessionContext?: { workspaceRoot: string; sessionId: string },
): Promise<CodexGoalSnapshot | GrokGoalSnapshot | null> {
  if (runtime === "grok") return readGrokGoalSnapshotInput(raw, cwd, sessionContext);
  return readCodexGoalSnapshotInput(raw, cwd);
}

export function reconcilePlatformGoalSnapshot(
  runtime: GoalRuntime,
  snapshot: CodexGoalSnapshot | GrokGoalSnapshot | null | undefined,
  options: ReconcilePlatformGoalOptions,
): PlatformGoalReconciliation {
  if (runtime === "grok") {
    const grokOptions: Parameters<typeof reconcileGrokGoalSnapshot>[1] = {
      expectedObjective: options.expectedObjective,
      ...(options.acceptedObjectives === undefined ? {} : { acceptedObjectives: options.acceptedObjectives }),
      ...(options.allowedStatuses === undefined
        ? {}
        : { allowedStatuses: options.allowedStatuses as GrokGoalSnapshotStatus[] }),
      ...(options.requireSnapshot === undefined ? {} : { requireSnapshot: options.requireSnapshot }),
      ...(options.requireComplete === undefined ? {} : { requireComplete: options.requireComplete }),
    };
    return reconcileGrokGoalSnapshot(snapshot as GrokGoalSnapshot | null, grokOptions);
  }
  const codexOptions: Parameters<typeof reconcileCodexGoalSnapshot>[1] = {
    expectedObjective: options.expectedObjective,
    ...(options.acceptedObjectives === undefined ? {} : { acceptedObjectives: options.acceptedObjectives }),
    ...(options.allowedStatuses === undefined
      ? {}
      : { allowedStatuses: options.allowedStatuses as CodexGoalSnapshotStatus[] }),
    ...(options.requireSnapshot === undefined ? {} : { requireSnapshot: options.requireSnapshot }),
    ...(options.requireComplete === undefined ? {} : { requireComplete: options.requireComplete }),
  };
  return reconcileCodexGoalSnapshot(snapshot as CodexGoalSnapshot | null, codexOptions);
}

export function formatPlatformGoalReconciliation(
  runtime: GoalRuntime,
  reconciliation: PlatformGoalReconciliation,
): string {
  if (runtime === "grok") return formatGrokGoalReconciliation(reconciliation as GrokGoalReconciliation);
  return formatCodexGoalReconciliation(reconciliation as CodexGoalReconciliation);
}

export function platformGoalJsonFlag(runtime: GoalRuntime): "--grok-goal-json" | "--codex-goal-json" {
  return runtime === "grok" ? "--grok-goal-json" : "--codex-goal-json";
}