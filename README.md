# omo-grok — oh-my-openagent Light for Grok CLI

Grok Build plugin adapter porting omo Light edition components:

- **rules** — `.omo/rules/**` materialized into a managed block of `AGENTS.md` on `SessionStart` (Grok ignores `SessionStart` stdout, so a static file is used instead; set `OMO_RULES_AGENTS_MD=0` to disable)
- **comment-checker** — blocks AI slop comments on `PreToolUse` for `search_replace`/`write_file` (Claude aliases `Edit`/`Write`)
- **update_goal guard** — `PreToolUse` deny that blocks premature `update_goal({completed:true})` while an omo ulw-loop plan is mid-flight
- **ultrawork / ulw-loop** — keyword detection + `.omo/ulw-loop/<session>/` durable state (see the caveat under [Long-running tasks](#long-running-tasks-goal-vs-ulw-loop))
- **start-work-continuation** — boulder `.omo/boulder.json` Stop chain

## Long-running tasks: `/goal` vs `ulw-loop`

**Use Grok's native [`/goal`](https://x.ai/news/introducing-goal) for long-running autonomous execution.** It plans an approach, renders a live progress panel + checklist, keeps working until the task is verified, and supports `/goal status|pause|resume|clear`. It is built into Grok Build (available whenever the `update_goal` tool is in the session toolset) — this is the recommended way to hand off large tasks.

**Why the `ulw-loop` / `ultrawork` prompt keywords don't show a goal panel.** Those keywords are detected by omo-grok's `UserPromptSubmit` hook, which injects a steering directive via stdout. **Grok ignores `UserPromptSubmit` stdout** (only `PreToolUse` reads hook stdout in Grok 0.2.77), so the directive never reaches the model and no panel appears — the hook still runs and writes `.omo/ulw-loop/<session>/` state, but that state is inert at the prompt level. This is a structural limitation of Grok's hook contract, not a bug a plugin can fix. **Prefer `/goal`; it supersedes the `ulw-loop` prompt flow.**

**How omo-grok complements `/goal`.** Grok's native goal loop drives the `update_goal` tool, and omo-grok registers a `PreToolUse` hook on `update_goal`. That hook (a `deny`, which *is* honored by Grok) currently activates only when an omo ulw-loop plan exists under `.omo/ulw-loop/` — it blocks `update_goal({completed:true})` before the plan's final story + quality gate. With a plain native `/goal` (no omo plan on disk), the guard stays fail-open (no-op) and does not interfere.

**Need headless / scripted auto-continue?** Use the external orchestrator (no panel, but a real re-prompt loop):

```bash
omo-grok-hook orchestrate --ultrawork --task "<task>" [--cwd DIR --model grok-build --max-iterations N]
```

It loops `grok -p` (`--session-id` then `--resume`) using the same continuation logic until the loop reports completion (e.g. `<promise>VERIFIED</promise>`).

## Install

```bash
npm run build
npm run install-plugin   # stages without node_modules; grok plugin install --trust exits 0
```

Reload hooks: new Grok session or TUI `Ctrl+L`.

## Develop

```bash
npm run build
npm test
export GROK_PLUGIN_ROOT="$(pwd)"
printf '%s\n' '{"hookEventName":"UserPromptSubmit","sessionId":"s1","workspaceRoot":"'"$(pwd)"'","prompt":"ultrawork fix tests"}' \
  | bash hooks/run-hook.sh user-prompt
```

## vs oh-my-grok

Use **omo-grok** for authentic omo workspace paths (`.omo/`) and comment-checker.
Use **oh-my-grok** for skill-gate, hashline, prometheus, bundled superpowers.
Both can be installed; avoid duplicate Stop hooks by enabling one primary loop plugin.