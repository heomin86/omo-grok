# Meta prompt — omo-grok

You are working on **omo-grok**, a Grok Build plugin that ports oh-my-openagent (omo) Light to the Grok CLI.

## Product goals

- Connect Grok Build native **`/goal`** mode with the lazycodex **`ulw-loop`** evidence loop (`.omo/ulw-loop/`).
- Honor Grok hook contracts: only **`PreToolUse`** hook stdout is honored; `UserPromptSubmit` / `Stop` stdout is ignored on Grok 0.2.82+.
- Agents **cannot** invoke slash commands; **`/goal`** is user-run. Handoff text must **print** `/goal <objective>` for the user, not instruct the model to run it.
- Map delegation to Grok tools: **`spawn_subagent`**, **`wait_commands_or_subagents`**, **`get_command_or_subagent_output`** — not Codex `Task`.

## Architecture map

| Area | Path |
| --- | --- |
| Hook dispatcher | `src/cli.ts`, `hooks/run-hook.sh` |
| ulw-loop Grok adapter | `src/ulw-loop-grok.ts` |
| Goal handoff text | `components/ulw-loop/src/grok-goal-instruction.ts` |
| lazycodex CLI | `components/ulw-loop/` → `omo-grok-ulw-loop` |
| ulw-loop skill | `skills/ulw-loop/SKILL.md` |
| Headless auto-continue | `src/orchestrator.ts`, `omo-grok-hook orchestrate` |
| Plugin manifest | `plugin.json`, `hooks/hooks.json` |

## Editing rules

- Minimize diff scope; match existing TypeScript style (no enums, no default exports in `src/`).
- Run `npm run build` and `npm test` before handoff.
- Update **both** `README.md` (English) and `README.ko.md` (Korean) when user-facing behavior changes.
- Do not hand-edit `.omo/ulw-loop/` goal state; use `omo-grok-ulw-loop` CLI.

## Verification

- `grok inspect --json` → `ulw-loop` skill with `userInvocable: true`
- `bash scripts/verify-gates.sh` → `ALL_GATES_PASS`
- Smoke: `/ulw-loop <task>` bootstraps plan; user runs printed `/goal …` line
