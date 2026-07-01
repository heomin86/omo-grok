# omo-grok — oh-my-openagent Light for Grok CLI

Grok Build plugin adapter porting omo Light edition components:

- **rules** — `.omo/rules/**` materialized into a managed block of `AGENTS.md` on `SessionStart` (Grok ignores `SessionStart` stdout, so a static file is used instead; set `OMO_RULES_AGENTS_MD=0` to disable)
- **comment-checker** — blocks AI slop comments on `PreToolUse` for `search_replace`/`write_file` (Claude aliases `Edit`/`Write`)
- **ultrawork / ulw-loop** — keyword detection + `.omo/ulw-loop/<session>/` durable state
- **start-work-continuation** — boulder `.omo/boulder.json` Stop chain

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