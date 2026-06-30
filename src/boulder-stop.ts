import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const START_WORK_DIRECTIVE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../assets/start-work-directive.md"),
  "utf8",
);

type PlanChecklist = {
  completed: number;
  remaining: number;
  total: number;
  nextTaskLabel: string | null;
};

type BoulderWork = {
  activePlan: string;
  planName: string;
  status?: "active" | "paused" | "completed" | "abandoned";
  sessionIds: readonly string[];
  worktreePath?: string;
  startedAt?: string;
  updatedAt?: string;
};

export function runBoulderStopHook(cwd: string, sessionId: string, stopHookActive: boolean): string {
  if (stopHookActive) return "";
  const state = readContinuationState(cwd, sessionId);
  if (state === null) return "";
  return JSON.stringify({
    decision: "block",
    reason: renderDirective(state, sessionId),
  });
}

function readContinuationState(cwd: string, sessionId: string) {
  const boulderPath = join(cwd, ".omo", "boulder.json");
  const boulderState = readBoulderState(boulderPath);
  if (boulderState === null) return null;
  const work = getWorkForSession(boulderState, normalizeSessionId(sessionId));
  if (work === null || !isContinuableStatus(work.status)) return null;
  const planPath = resolveBoulderPlanPathForWork(cwd, work);
  const checklist = getPlanChecklist(planPath);
  if (checklist.remaining === 0) return null;
  return {
    planName: work.planName,
    planPath,
    boulderPath,
    ledgerPath: join(cwd, ".omo", "start-work", "ledger.jsonl"),
    worktreePath: work.worktreePath ?? null,
    checklist,
  };
}

function renderDirective(
  state: NonNullable<ReturnType<typeof readContinuationState>>,
  sessionId: string,
): string {
  const worktreeBlock =
    state.worktreePath === null
      ? ""
      : `\n- Worktree: \`${state.worktreePath}\` (all edits, tests, and commands run inside this directory)`;
  const replacements: Record<string, string> = {
    PLAN_NAME: state.planName,
    PLAN_PATH: state.planPath,
    BOULDER_PATH: state.boulderPath,
    REMAINING_COUNT: String(state.checklist.remaining),
    TOTAL_COUNT: String(state.checklist.total),
    NEXT_TASK_LABEL: state.checklist.nextTaskLabel ?? "",
    WORKTREE_BLOCK: worktreeBlock,
    LEDGER_PATH: state.ledgerPath,
    SESSION_ID: sessionId,
  };
  let rendered = START_WORK_DIRECTIVE;
  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

function getPlanChecklist(planPath: string): PlanChecklist {
  if (!existsSync(planPath)) return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
  try {
    return parsePlanChecklist(readFileSync(planPath, "utf8"));
  } catch {
    return { completed: 0, remaining: 0, total: 0, nextTaskLabel: null };
  }
}

function parsePlanChecklist(markdown: string): PlanChecklist {
  const lines = markdown.split(/\r?\n/);
  let completed = 0;
  let remaining = 0;
  let nextTaskLabel: string | null = null;
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## TODOs") || line.startsWith("## Final Verification Wave")) {
      inSection = true;
      continue;
    }
    if (line.startsWith("## ") && inSection) inSection = false;
    if (!inSection) continue;
    if (line.startsWith("- [ ] ")) {
      remaining += 1;
      nextTaskLabel = nextTaskLabel ?? line.slice(6);
    } else if (line.startsWith("- [x] ") || line.startsWith("- [X] ")) {
      completed += 1;
    }
  }
  return { completed, remaining, total: completed + remaining, nextTaskLabel };
}

function readBoulderState(path: string) {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parseBoulderState(parsed);
  } catch {
    return null;
  }
}

function parseBoulderState(value: unknown) {
  if (!isRecord(value)) return null;
  const works: BoulderWork[] = [];
  const worksValue = value["works"];
  const hasWorksMap = isRecord(worksValue);
  if (hasWorksMap) {
    for (const workValue of Object.values(worksValue)) {
      const work = parseBoulderWork(workValue);
      if (work !== null) works.push(work);
    }
  }
  const mirrorWork = parseBoulderWork(value);
  if (works.length === 0 && mirrorWork === null) return null;
  return { works, mirrorWork, hasWorksMap };
}

function parseBoulderWork(value: unknown): BoulderWork | null {
  if (!isRecord(value)) return null;
  const activePlan = value["active_plan"];
  if (typeof activePlan !== "string") return null;
  const sessionIds = Array.isArray(value["session_ids"])
    ? value["session_ids"].filter((s): s is string => typeof s === "string").map(normalizeSessionId)
    : [];
  return {
    activePlan,
    planName: typeof value["plan_name"] === "string" ? value["plan_name"] : activePlan,
    sessionIds,
    status: parseStatus(value["status"]),
    worktreePath: typeof value["worktree_path"] === "string" ? value["worktree_path"] : undefined,
    startedAt: typeof value["started_at"] === "string" ? value["started_at"] : undefined,
    updatedAt: typeof value["updated_at"] === "string" ? value["updated_at"] : undefined,
  };
}

function getWorkForSession(state: NonNullable<ReturnType<typeof parseBoulderState>>, sessionId: string) {
  for (const work of state.works) {
    if (work.sessionIds.includes(sessionId)) return work;
  }
  if (state.hasWorksMap) return null;
  if (state.mirrorWork?.sessionIds.includes(sessionId)) return state.mirrorWork;
  return null;
}

function resolveBoulderPlanPathForWork(cwd: string, work: BoulderWork): string {
  const absolute = isAbsolute(work.activePlan) ? resolve(work.activePlan) : resolve(cwd, work.activePlan);
  if (!work.worktreePath) return absolute;
  const rel = relative(resolve(cwd), absolute);
  if (rel.startsWith("..") || isAbsolute(rel)) return absolute;
  const wt = resolve(cwd, work.worktreePath, rel);
  return existsSync(wt) ? wt : absolute;
}

function normalizeSessionId(sessionId: string): string {
  return /^(codex|opencode):/.test(sessionId) ? sessionId : `codex:${sessionId}`;
}

function isContinuableStatus(status?: BoulderWork["status"]): boolean {
  return status === "active" || status === "paused" || status === undefined;
}

function parseStatus(value: unknown): BoulderWork["status"] | undefined {
  if (value === "active" || value === "paused" || value === "completed" || value === "abandoned") return value;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}