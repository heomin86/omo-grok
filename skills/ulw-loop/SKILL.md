---
name: ulw-loop
description: "Grok ultrawork loop with durable .omo/ulw-loop state and native /goal integration. Triggers: /ulw-loop, ultrawork, ulw, durable goal execution, evidence-led work."
user-invocable: true
argument-hint: "<task brief>"
when-to-use: "User asks for /ulw-loop, ultrawork, ulw, a durable multi-goal plan, evidence-led delivery, or sets a /goal that names ulw-loop."
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

# ulw-loop

Use this skill when the user asks for `ulw-loop`, `ulw`, durable goal execution, evidence-led work, manual QA, or checkpointed long-running delivery. Arguments passed after `/ulw-loop` are the task brief.

This skill is intentionally compact. The full workflow lives in `references/full-workflow.md`. Read only the sections needed for the current phase, then execute them exactly.

## Required First Steps

1. Open `references/full-workflow.md`.
2. Read through **Bootstrap** (including its tier triage), **Execution Loop**, and the **Manual-QA channels** table before running any ULW command or recording evidence.
3. Bootstrap the durable plan from the task brief: `omo-grok-ulw-loop create-goals --goal-runtime grok --brief "<task brief>"` (CLI resolution fallbacks are in the full workflow).
4. Perform the **Grok /goal handoff** below so the run is driven by Grok's native goal mode.
5. If the task has code edits, tests, QA, or commit work, follow the full workflow's delegation and evidence rules. Tests alone never prove done.

## Grok /goal Handoff

`/goal` is a USER-run TUI command. You (the agent) CANNOT invoke slash commands; your only goal-mode surface is the `update_goal` tool, and it works only while a goal the user started is active.

After bootstrap, read the aggregate objective from the plan (`omo-grok-ulw-loop status --goal-runtime grok --json`, field `codexObjective`) and check Grok goal state (`goal/plan.md` or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>`):

- **No active Grok goal** — print this copy-paste block for the user, then keep executing the first story in this same turn (do not wait):

  ```
  To run this ulw-loop under Grok's native goal mode (live panel + auto-continue), run:
  /goal <aggregate objective from the plan>
  ```

- **Active goal matching the aggregate objective** — you are inside goal mode: report progress with `update_goal({message})` and continue stories.
- **Active goal with a different objective** — STOP, checkpoint blocked, surface the conflict.

Never call `update_goal({completed: true})` mid-aggregate; the omo-grok plugin's PreToolUse guard denies it until the final story's quality gate passes.

## Non-Negotiables

- Use the ulw-loop CLI state under `.omo/ulw-loop`; do not hand-edit goal state.
- After any compaction or context loss, re-read brief + goals + ledger FIRST (read `.omo/ulw-loop/ledger.jsonl` directly) plus `omo-grok-ulw-loop status --json`, then resume; never re-plan from scratch.
- If `omo-grok-ulw-loop create-goals` says the existing aggregate is already complete, start unrelated new work with a fresh `--session-id <new-id>` instead of steering or forcing the completed default state. Use `--force` only to intentionally overwrite completed evidence.
- Every success criterion needs observable evidence from a real surface: a channel (tmux, HTTP, browser, computer-use) or, for CLI- or data-shaped criteria, an auxiliary surface (CLI stdout, DB diff, parsed config dump).
- Record evidence through the CLI only after cleanup receipts are available.
- Delegate code edits, test writes, fixes, and QA execution to right-sized `spawn_subagent` workers when the workflow requires it.
- Every delegated worker prompt starts with `TASK:`, then names `DELIVERABLE`, `SCOPE`, and `VERIFY`; put role and specialty instructions in the task body.
- Plan and reviewer workers may run for a long time; launch them via `spawn_subagent`, keep doing independent root work, and poll with `wait_commands_or_subagents` / `get_command_or_subagent_output` in short cycles.
- Track spawned subagent work locally. A timeout only means no new update arrived; treat a running child as alive until it returns a deliverable or explicit blocker.
- While children run, surface the active subagent count and latest phase in your updates.
- Use `git-master` for git-tracked edits: inspect recent and touched-path commit history, then commit each verified work unit atomically in the repository's observed language, scope, and message style with only that unit's files staged.

## Grok Tool Mapping

| Workflow intent | Grok tool / command |
| --- | --- |
| Activate durable ulw-loop plan | `omo-grok-ulw-loop create-goals --goal-runtime grok --brief "..."` |
| Resume next ledger story | `omo-grok-ulw-loop complete-goals --goal-runtime grok` |
| Read Grok goal state | `goal/plan.md` or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>` |
| Start Grok goal mode | USER runs `/goal <objective>` — you print the exact line; you cannot invoke it |
| Progress updates | `update_goal({message: "..."})` (only while a goal is active) |
| Final completion signal | `update_goal({completed: true, message: "..."})` only after quality gate on final story |
| Clear Grok goal after aggregate | ask the user to run `/goal clear` |
| Plan / explorer / implement / QA / reviewer | `spawn_subagent` with `TASK:`-prefixed prompts; poll via `wait_commands_or_subagents` |

Default `--goal-runtime` is `grok`. Do not call `get_goal` or `create_goal`; Grok has no Codex goal tools.
