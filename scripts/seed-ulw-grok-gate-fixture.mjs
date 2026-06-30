#!/usr/bin/env node
/**
 * Seed a minimal aggregate ulw-loop plan with G001/G002 for gating-ulw-grok-goal.
 * Usage: node scripts/seed-ulw-grok-gate-fixture.mjs <workspaceRoot>
 * Prints export AGGREGATE_OBJECTIVE=... and export GOAL_ID=... on stdout for shell eval.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE } from "../components/ulw-loop/dist/goal-status.js";

const ws = process.argv[2];
if (!ws) {
  process.stderr.write("usage: seed-ulw-grok-gate-fixture.mjs <workspaceRoot>\n");
  process.exit(2);
}

const now = new Date().toISOString();
const aggregateObjective = ULW_LOOP_AGGREGATE_CODEX_OBJECTIVE;

function criterion(id, status, essential = true) {
  return {
    id,
    scenario: `${id} gate scenario`,
    userModel: "happy",
    expectedEvidence: `${id} observable proof`,
    capturedEvidence: status === "pass" ? `${id} passed` : null,
    essential,
    status,
  };
}

const plan = {
  version: 1,
  createdAt: now,
  updatedAt: now,
  briefPath: ".omo/ulw-loop/brief.md",
  goalsPath: ".omo/ulw-loop/goals.json",
  ledgerPath: ".omo/ulw-loop/ledger.jsonl",
  codexGoalMode: "aggregate",
  codexObjective: aggregateObjective,
  activeGoalId: "G001",
  goals: [
    {
      id: "G001",
      title: "Gate story one",
      objective: "First gate story",
      status: "in_progress",
      successCriteria: [
        criterion("C001", "pass", true),
        criterion("C002", "pass", true),
        criterion("C003", "pass", false),
      ],
      attempt: 1,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
    },
    {
      id: "G002",
      title: "Gate story two",
      objective: "Second gate story",
      status: "pending",
      successCriteria: [
        criterion("C004", "pending", true),
        criterion("C005", "pending", true),
        criterion("C006", "pending", false),
      ],
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    },
  ],
};

const dir = join(ws, ".omo", "ulw-loop");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "brief.md"), "# Gate fixture brief\n\n- Gate story one\n- Gate story two\n");
writeFileSync(join(dir, "goals.json"), `${JSON.stringify(plan, null, 2)}\n`);
writeFileSync(join(dir, "ledger.jsonl"), `${JSON.stringify({ at: now, kind: "plan_created", message: "gate fixture seeded" })}\n`);

process.stdout.write(`export AGGREGATE_OBJECTIVE=${JSON.stringify(aggregateObjective)}\n`);
process.stdout.write("export GOAL_ID=G001\n");