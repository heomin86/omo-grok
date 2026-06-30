---
name: ulw-loop
description: "Grok ultrawork loop with Stop-hook continuation and .omo/ulw-loop state. Triggers: /ulw-loop, ultrawork, ulw, durable goal execution, evidence-led work."
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (read `.omo/ulw-loop/ledger.jsonl` directly) plus `omo-grok-ulw-loop status --json`, then resume; never re-plan from scratch.
- If `omo-grok-ulw-loop create-goals` says the existing aggregate is already complete, start unrelated new work with a fresh `--session-id <new-id>` instead of steering or forcing the completed default state. Use `--force` only to intentionally overwrite completed evidence.
- Every success criterion needs observable evidence from a real surface: a channel (tmux, HTTP, browser, computer-use) or, for CLI- or data-shaped criteria, an auxiliary surface (CLI stdout, DB diff, parsed config dump).
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized Task subagents when the workflow requires it.
- Every delegated Task prompt starts with `TASK:`, then names `DELIVERABLE`, `SCOPE`, and `VERIFY`; put role and specialty instructions in the task body.
- Plan and reviewer agents may run for a long time; launch them via Task, keep doing independent root work, and poll for results in short cycles.
- Track spawned subagent work locally. A timeout only means no new update arrived; treat a running child as alive until it returns a deliverable or explicit blocker.
- While children run, surface the active subagent count and latest phase in your updates.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically in the repository's observed language, scope, and message style with only that unit's files staged.

## Grok Tool Mapping

| Workflow intent | Grok tool / command |
| --- | --- |
| Activate durable ulw-loop plan | `omo-grok-ulw-loop create-goals --goal-runtime grok --brief "..."` |
| Resume next ledger story | `omo-grok-ulw-loop complete-goals --goal-runtime grok` |
| Read Grok goal state | `goal/plan.md` or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>` |
| Start / align Grok goal | `/goal <objective>` (slash command) |
| Progress updates | `update_goal({message: "..."})` |
| Final completion signal | `update_goal({completed: true, message: "..."})` only after quality gate on final story |
| Clear Grok goal after aggregate | `/goal clear` |
| Plan / explorer / implement / QA / reviewer | `Task` tool with `TASK:`-prefixed prompts |

Default `--goal-runtime` is `grok`. Do not call `get_goal` or `create_goal`; Grok has no Codex goal tools.
