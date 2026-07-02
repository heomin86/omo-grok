# omo-grok — oh-my-openagent Light for Grok CLI

Grok Build plugin adapter porting omo Light edition components:

- **rules** — `.omo/rules/**` materialized into a managed block of `AGENTS.md` on `SessionStart` (Grok ignores `SessionStart` stdout, so a static file is used instead; set `OMO_RULES_AGENTS_MD=0` to disable)
- **comment-checker** — blocks AI slop comments on `PreToolUse` for `search_replace`/`write_file` (Claude aliases `Edit`/`Write`)
- **update_goal guard** — `PreToolUse` deny that blocks premature `update_goal({completed:true})` while an omo ulw-loop plan is mid-flight
- **ultrawork / ulw-loop** — `/ulw-loop` skill slash command + `.omo/ulw-loop/<session>/` durable state (see [Long-running tasks](#long-running-tasks-goal--ulw-loop))
- **start-work-continuation** — boulder `.omo/boulder.json` Stop chain

## Long-running tasks: `/goal` × `ulw-loop`

Grok Build's native [`/goal`](https://x.ai/news/introducing-goal) mode drives long-running autonomous execution: it plans, renders a live progress panel, and keeps re-prompting the agent until the objective is verified. The ulw-loop skill layers the lazycodex evidence loop (durable `.omo/ulw-loop` plan, ledger, criteria gate) on top of it. Two working entry paths:

1. **`/goal` first (recommended, one step):**

   ```
   /goal Use the ulw-loop skill to <task>
   ```

   Goal mode activates natively, and the objective's `ulw-loop` trigger makes the agent load this plugin's skill, bootstrap `.omo/ulw-loop/`, and work the stories under the goal panel.

2. **`/ulw-loop` first:** type `/ulw-loop <task>` (the skill is user-invocable, so it appears as a slash command). The agent bootstraps the durable plan, then prints the exact `/goal <aggregate objective>` line for you to run. Running that line attaches the native goal panel to the ulw-loop run.

**Why the extra `/goal` step in path 2?** `/goal` is a TUI-level command and only the user can invoke it — the agent's only goal surface is the `update_goal` tool, which works solely inside an already-active goal. A plugin cannot start goal mode programmatically.

**Hook contract caveat (verified on Grok 0.2.82).** Grok only honors hook stdout decisions on `PreToolUse`; `UserPromptSubmit` and `Stop` stdout is ignored. So the bare `ultrawork` / `ulw-loop` prompt keywords (without the slash command) write `.omo/ulw-loop/` state but cannot inject steering or auto-continue the session. Use the `/ulw-loop` slash command or `/goal` paths above instead.

**How the guard complements `/goal`.** While an omo ulw-loop plan is mid-flight, the plugin's `PreToolUse` hook on `update_goal` (a `deny`, which Grok does honor) blocks `update_goal({completed:true})` until the final story's quality gate passes — native goal mode cannot be marked complete before the lazycodex criteria gate clears. Without a plan on disk the guard is a no-op.

**Need headless / scripted auto-continue?** Use the external orchestrator (no panel, but a real re-prompt loop):

```bash
omo-grok-hook orchestrate --ultrawork --task "<task>" [--cwd DIR --model grok-build --max-iterations N]
```

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