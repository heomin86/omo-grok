# Changelog

All notable changes to **omo-grok** are documented here.

## [0.1.1] - 2026-07-02

Fix `/ulw-loop` so it correctly hands off to Grok Build's native `/goal` mode and the lazycodex (`codex-ulw-loop`) evidence loop.

### Highlights

- **`/ulw-loop` is now a real slash command** — the skill is marked `user-invocable: true` with an `argument-hint`, so Grok TUI exposes `/ulw-loop <task>` (verified via `grok inspect` on Grok **0.2.82**).
- **Explicit Grok `/goal` handoff** — after bootstrapping the `.omo/ulw-loop` plan, the agent prints the exact `/goal <aggregate objective>` line for the user to run, then keeps working the first story without waiting.
- **Two documented entry paths** (see README):
  1. `/goal Use the ulw-loop skill to <task>` — one step, recommended
  2. `/ulw-loop <task>` → run the printed `/goal ...` line
- **Grok tool mapping corrected** — delegation uses `spawn_subagent` / `wait_commands_or_subagents` / `get_command_or_subagent_output` (Grok Build has no Codex `Task` tool).

### Bug Fixes

- **Goal panel never appeared after `/ulw-loop`** — skill and handoff text told the *model* to run `/goal`, but `/goal` is a user-only TUI slash command; agents cannot invoke slash commands and only get `update_goal` while a goal is already active.
- **Run stalled after the first turn** — without native goal mode, the lazycodex loop could not progress under Grok's goal lifecycle.
- **Misleading delegation instructions** — references to Codex `Task` / `multi_agent_v1.spawn_agent` replaced with Grok Build equivalents.

### Changed

- `skills/ulw-loop/SKILL.md` — slash command metadata, `/goal` handoff section, Grok tool table
- `skills/ulw-loop/references/full-workflow.md` — Acquire Next Goal table and constraints aligned with user-run `/goal`
- `components/ulw-loop/src/grok-goal-instruction.ts` — handoff surfaces `/goal` lines to the user; reviewers via `spawn_subagent`
- `README.md` — `/goal` × `ulw-loop` usage, hook contract caveat (PreToolUse-only stdout on 0.2.82), orchestrator fallback

### Known Limitations

- **Agents cannot start goal mode** — the user must run `/goal` once (path 2 above); plugins cannot invoke TUI slash commands.
- **Prompt keywords alone are inert** — bare `ultrawork` / `ulw-loop` text triggers hooks that write `.omo/ulw-loop/` state, but Grok ignores `UserPromptSubmit` / `Stop` hook stdout; use `/ulw-loop` or `/goal` instead.
- **`update_goal` guard unchanged** — while an omo ulw-loop plan is mid-flight, `PreToolUse` deny still blocks premature `update_goal({completed: true})` until the final story's quality gate passes.

### Upgrade

```bash
cd ~/omo-grok
git pull
npm run build
npm run install-plugin
```

Start a new Grok session or press `Ctrl+L` to reload hooks.

### Verification

- `npm test`: 42 files / 353 tests passed
- `verify-gates.sh`: `ALL_GATES_PASS`, `ULW_GROK_GOAL_GATE_PASS` (Grok 0.2.82 plugin install)

---

## [0.1.0] - 2026-07-01

First tagged release. See [GitHub release v0.1.0](https://github.com/heomin86/omo-grok/releases/tag/v0.1.0) for details.

- Grok 0.2.77 hook I/O contract alignment (#2)
- Headless orchestration for ultrawork / ulw-loop / boulder auto-continue (#3)
