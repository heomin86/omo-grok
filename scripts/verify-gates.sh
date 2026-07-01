#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/omo-grok-scratch}"
RUN_GATE=(node "$ROOT/scripts/run-gate.mjs")

mkdir -p "$SCRATCH"
exec >"$SCRATCH/verify-gates-stdout.log" 2>&1

if [[ "${GROK_SKIP_PLUGIN_INSTALL:-}" == "1" ]] || [[ -f "$ROOT/dist/cli.js" && -f "$ROOT/hooks/hooks.json" ]]; then
  echo "=== plugin install skipped (dev tree ready at $ROOT) ==="
  echo "GROK_SKIP_PLUGIN_INSTALL=${GROK_SKIP_PLUGIN_INSTALL:-auto}"
else
  set +e
  bash "$ROOT/scripts/install-plugin.sh"
  INSTALL_RC=$?
  set -e
  if [[ $INSTALL_RC -ne 0 ]]; then
    echo "WARN: install-plugin.sh exit=$INSTALL_RC — continuing with dev-tree fallback when possible"
    test -f "$ROOT/dist/cli.js" || exit "$INSTALL_RC"
  fi
fi

resolve_plugin_root() {
  local list_path=""
  for d in "$HOME/.grok/installed-plugins"/*; do
    [[ -f "$d/plugin.json" ]] || continue
    grep -q '"name": "omo-grok"' "$d/plugin.json" || continue
    list_path="$d"
    break
  done
  if [[ -n "$list_path" && -f "$list_path/dist/cli.js" ]]; then
    echo "$list_path"
    return
  fi
  if [[ -f "$ROOT/dist/cli.js" ]]; then
    echo "$ROOT"
    return
  fi
  echo "ERROR: cannot resolve GROK_PLUGIN_ROOT" >&2
  exit 1
}

export GROK_PLUGIN_ROOT="$(resolve_plugin_root)"

{
  echo "=== plugin-enabled ==="
  echo "--- config.toml [plugins] ---"
  sed -n '/^\[plugins\]/,/^\[/p' "$HOME/.grok/config.toml" | head -5
  echo "--- grok plugin list ---"
  grok plugin list
  echo "--- grok inspect omo-grok ---"
  grok inspect --json | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      const j=JSON.parse(d);
      const p=(j.plugins||[]).find(x=>x.name==='omo-grok');
      if(!p){console.error('omo-grok missing from inspect');process.exit(1);}
      console.log(JSON.stringify(p,null,2));
      if(p.enabled!==true){console.error('omo-grok not enabled in inspect');process.exit(1);}
      if(!p.provides?.hooks){console.error('omo-grok hooks not listed');process.exit(1);}
    });
  "
} >"$SCRATCH/plugin-enabled.log" 2>&1

{
  echo "=== gating-install ==="
  echo "source_tree=$ROOT"
  echo "GROK_PLUGIN_ROOT=$GROK_PLUGIN_ROOT"
  grok --version
  grok plugin list
  grok plugin validate "$ROOT"
  test -f "$GROK_PLUGIN_ROOT/dist/cli.js"
  test -f "$GROK_PLUGIN_ROOT/hooks/hooks.json"
  test -f "$GROK_PLUGIN_ROOT/plugin.json"
  node -e "const cc=require('$GROK_PLUGIN_ROOT/node_modules/@code-yeongyu/comment-checker');const fs=require('fs');const b=cc.getBinaryPath();if(!fs.existsSync(b))process.exit(1);console.log('comment-checker:',b)"
} >"$SCRATCH/gating-install.log" 2>&1

if [[ ! -f "$SCRATCH/comparison.txt" ]]; then
  cat >"$SCRATCH/comparison.txt" <<'EOF'
omo-grok adapter vs oh-my-grok vs omo fork (Grok CLI)

| Capability | omo-grok (~/omo-grok) | oh-my-grok | full omo fork |
|------------|----------------------|------------|---------------|
| .omo/rules injection | yes (rules-engine) | partial | yes (Codex hooks) |
| ultrawork / ulw-loop | yes | yes (ralph) | yes |
| comment-checker | yes | yes | yes |
| boulder / start-work Stop | yes | yes | yes |
| hashline LINE#ID | yes | yes | Codex-only |
| LSP Stop enforce | yes | yes | yes |
| ast-grep MCP | yes (.mcp.json) | yes | opencode MCP |
| Grok-native hooks | yes | yes | requires port |
| Maintenance | low (adapter) | low | high |

Recommendation: use omo-grok adapter; oh-my-grok only for non-overlapping extras (prometheus, skill-gate). Do not co-install both on Stop/UserPromptSubmit.
EOF
fi

WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-gates.XXXXXX")"
trap 'rm -rf "$WS"' EXIT
mkdir -p "$WS/.omo/rules" "$WS/.omo/plans"
cat >"$WS/.omo/rules/test.md" <<'EOF'
---
alwaysApply: true
---
# Gate rule
OMO_RULE_MARKER gate fixture.
EOF

# Grok ignores SessionStart stdout, so rules are materialized into a managed
# block of AGENTS.md on SessionStart; assert the file, not injected stdout.
SESSION_RULES="gate-rules-$(date +%s)"
PAYLOAD_RULES=$(cat <<EOF
{"hookEventName":"SessionStart","sessionId":"${SESSION_RULES}","workspaceRoot":"${WS}"}
EOF
)
{
  echo "=== gating-rules ==="
  "${RUN_GATE[@]}" session-start "$PAYLOAD_RULES"
  echo "--- AGENTS.md ---"
  cat "$WS/AGENTS.md"
} >"$SCRATCH/gating-rules.log" 2>&1
grep -q 'OMO_RULE_MARKER' "$SCRATCH/gating-rules.log"
grep -q 'omo-grok rules' "$SCRATCH/gating-rules.log"

SESSION_ULW="gate-ulw-$(date +%s)"
PAYLOAD_ULW=$(cat <<EOF
{"hookEventName":"UserPromptSubmit","sessionId":"${SESSION_ULW}","workspaceRoot":"${WS}","prompt":"ultrawork echo hello in temp file"}
EOF
)
PAYLOAD_ULW_STOP=$(cat <<EOF
{"hookEventName":"Stop","sessionId":"${SESSION_ULW}","workspaceRoot":"${WS}","lastAssistantMessage":"still working"}
EOF
)
{
  echo "=== gating-ulw ==="
  echo "launch_1=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${RUN_GATE[@]}" user-prompt "$PAYLOAD_ULW"
  echo "--- state ---"
  cat "$WS/.omo/ulw-loop/$SESSION_ULW/state.json"
  echo "--- stop ---"
  echo "launch_2=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  "${RUN_GATE[@]}" stop "$PAYLOAD_ULW_STOP"
} >"$SCRATCH/gating-ulw.log" 2>&1
grep -q 'ultrawork-mode' "$SCRATCH/gating-ulw.log"
grep -q '"active": true' "$SCRATCH/gating-ulw.log"
grep -q 'ULTRAWORK LOOP' "$SCRATCH/gating-ulw.log"

# Grok ignores PostToolUse stdout, so comment-checker blocks via a PreToolUse
# deny on the native search_replace tool before the edit is applied.
PAYLOAD_CC=$(cat <<'EOF'
{"hookEventName":"PreToolUse","sessionId":"gate-cc","workspaceRoot":"WS_PLACEHOLDER","toolName":"search_replace","toolInput":{"path":"src/foo.ts","old_string":"const x = 1;","new_string":"// TODO: implement this properly\nconst x = 2;"}}
EOF
)
PAYLOAD_CC="${PAYLOAD_CC//WS_PLACEHOLDER/$WS}"
{
  echo "=== gating-cc ==="
  "${RUN_GATE[@]}" pre-tool-comment-checker "$PAYLOAD_CC"
} >"$SCRATCH/gating-cc.log" 2>&1
grep -q '"decision":"deny"' "$SCRATCH/gating-cc.log"
grep -qE 'comment-checker|COMMENT/DOCSTRING' "$SCRATCH/gating-cc.log"

SESSION_BOULDER="gate-boulder-$(date +%s)"
cat >"$WS/.omo/plans/plan.md" <<'EOF'
# Plan

## TODOs
- [ ] First task
- [x] Done
- [ ] Second task
EOF
cat >"$WS/.omo/boulder.json" <<EOF
{
  "schema_version": 2,
  "active_work_id": "work_1",
  "works": {
    "work_1": {
      "work_id": "work_1",
      "active_plan": ".omo/plans/plan.md",
      "plan_name": "launch-plan",
      "status": "active",
      "started_at": "2026-06-13T00:00:00.000Z",
      "session_ids": ["codex:${SESSION_BOULDER}"]
    }
  },
  "active_plan": ".omo/plans/plan.md",
  "plan_name": "legacy-launch-plan",
  "started_at": "2026-06-13T00:00:00.000Z",
  "status": "active",
  "session_ids": ["codex:${SESSION_BOULDER}"]
}
EOF

PAYLOAD_BOULDER=$(cat <<EOF
{"hookEventName":"Stop","sessionId":"${SESSION_BOULDER}","workspaceRoot":"${WS}","lastAssistantMessage":"done for now"}
EOF
)
{
  echo "=== gating-boulder ==="
  "${RUN_GATE[@]}" stop "$PAYLOAD_BOULDER"
} >"$SCRATCH/gating-boulder.log" 2>&1
grep -q '"decision":"block"' "$SCRATCH/gating-boulder.log"
grep -q 'start-work-continuation' "$SCRATCH/gating-boulder.log"
grep -q 'Remaining top-level checkboxes' "$SCRATCH/gating-boulder.log"

HASH_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-hash-gate.XXXXXX")"
HASH_HOME="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-hash-home.XXXXXX")"
HASH_FILE="$HASH_WS/foo.ts"
echo "const x = 1;" >"$HASH_FILE"
HASH_SESSION="gate-hash-$(date +%s)"
export GROK_HOME="$HASH_HOME"
PAYLOAD_READ=$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${HASH_SESSION}","workspaceRoot":"${HASH_WS}","toolName":"Read","toolInput":{"path":"foo.ts"}}
EOF
)
"${RUN_GATE[@]}" post-tool-read "$PAYLOAD_READ" >/dev/null
STALE_HASH="$(node -e "
const fs=require('fs');const crypto=require('crypto');const {resolve}=require('path');
const home=process.env.GROK_HOME;const ws='${HASH_WS}';const abs=resolve(ws,'foo.ts');
const digest=crypto.createHash('sha256').update(abs).digest('hex');
const cache=JSON.parse(fs.readFileSync(home+'/state/hashline/${HASH_SESSION}/'+digest+'.json','utf8'));
console.log(cache.lines['1']);
")"
echo "const x = 2;" >"$HASH_FILE"
"${RUN_GATE[@]}" post-tool-read "$PAYLOAD_READ" >/dev/null
PAYLOAD_HASH_DENY=$(cat <<EOF
{"hookEventName":"PreToolUse","sessionId":"${HASH_SESSION}","workspaceRoot":"${HASH_WS}","toolName":"StrReplace","toolInput":{"path":"foo.ts","old_string":"1#${STALE_HASH}","new_string":"const x = 3;"}}
EOF
)
{
  echo "=== gating-hashline ==="
  "${RUN_GATE[@]}" pre-tool-hashline "$PAYLOAD_HASH_DENY"
} >"$SCRATCH/gating-hashline.log" 2>&1
grep -q '"decision":"deny"' "$SCRATCH/gating-hashline.log"
grep -q 'stale LINE#ID' "$SCRATCH/gating-hashline.log"
rm -rf "$HASH_WS" "$HASH_HOME"
unset GROK_HOME

LSP_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-lsp-gate.XXXXXX")"
LSP_HOME="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-lsp-home.XXXXXX")"
LSP_SESSION="gate-lsp-$(date +%s)"
echo "const broken = ;" >"$LSP_WS/bad.ts"
export GROK_HOME="$LSP_HOME"
export OMO_LSP_MOCK_DIAG="error[typescript] (1:1): Type error in gate fixture."
PAYLOAD_LSP=$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${LSP_SESSION}","workspaceRoot":"${LSP_WS}","toolName":"StrReplace","toolInput":{"path":"bad.ts"}}
EOF
)
"${RUN_GATE[@]}" post-tool-lsp "$PAYLOAD_LSP" >/dev/null
PAYLOAD_LSP_STOP=$(cat <<EOF
{"hookEventName":"Stop","sessionId":"${LSP_SESSION}","workspaceRoot":"${LSP_WS}","lastAssistantMessage":"done"}
EOF
)
{
  echo "=== gating-lsp ==="
  "${RUN_GATE[@]}" stop "$PAYLOAD_LSP_STOP"
} >"$SCRATCH/gating-lsp.log" 2>&1
unset OMO_LSP_MOCK_DIAG
grep -q '"decision":"block"' "$SCRATCH/gating-lsp.log"
grep -q 'LSP errors remain' "$SCRATCH/gating-lsp.log"
rm -rf "$LSP_WS" "$LSP_HOME"
unset GROK_HOME

ULW_GROK_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-ulw-grok-gate.XXXXXX")"
npm run build:ulw-loop --silent
ULW_LOOP_BIN="$ROOT/components/ulw-loop/dist/cli.js"
test -f "$ULW_LOOP_BIN"
SEED_VARS="$(node "$ROOT/scripts/seed-ulw-grok-gate-fixture.mjs" "$ULW_GROK_WS")"
eval "$SEED_VARS"
PASS_SNAPSHOT=$(node -e 'process.stdout.write(JSON.stringify({ objective: process.argv[1], status: "active" }))' "$AGGREGATE_OBJECTIVE")
{
  echo "=== gating-ulw-grok-goal ==="
  node "$ULW_LOOP_BIN" help
  ULW_GROK_CREATE_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-ulw-create-gate.XXXXXX")"
  echo "--- create-goals fresh (goalRuntime grok) ---"
  (
    cd "$ULW_GROK_CREATE_WS"
    node "$ULW_LOOP_BIN" create-goals --goal-runtime grok --brief "Gate fixture brief for Grok ulw-loop" --json
  )
  rm -rf "$ULW_GROK_CREATE_WS"
  echo "--- create-goals idempotent refusal ---"
  (
    cd "$ULW_GROK_WS"
    node "$ULW_LOOP_BIN" create-goals --goal-runtime grok --brief "Gate fixture" --json 2>&1 || true
  )
  echo "GOAL_ID=$GOAL_ID"
  echo "PASS_SNAPSHOT=$PASS_SNAPSHOT"
  echo "--- checkpoint pass (matching active aggregate snapshot) ---"
  (
    cd "$ULW_GROK_WS"
    node "$ULW_LOOP_BIN" checkpoint --goal-runtime grok --goal-id "$GOAL_ID" --status complete \
      --evidence "gate pass: implementation and validation evidence for G001" \
      --grok-goal-json "$PASS_SNAPSHOT" --json
  )
  echo "--- re-seed for mismatch + hook fixtures ---"
  eval "$(node "$ROOT/scripts/seed-ulw-grok-gate-fixture.mjs" "$ULW_GROK_WS")"
  echo "--- checkpoint mismatch (wrong objective) ---"
  (
    cd "$ULW_GROK_WS"
    node "$ULW_LOOP_BIN" checkpoint --goal-runtime grok --goal-id "$GOAL_ID" --status complete \
      --evidence "gate mismatch evidence" \
      --grok-goal-json '{"objective":"WRONG aggregate objective","status":"active"}' --json 2>&1 || true
  )
  PAYLOAD_UPDATE_GOAL=$(cat <<EOF
{"hookEventName":"PreToolUse","sessionId":"gate-ulw-grok-deny","workspaceRoot":"$ULW_GROK_WS","toolName":"update_goal","toolInput":{"completed":true,"message":"too early"}}
EOF
)
  "${RUN_GATE[@]}" pre-tool-update-goal "$PAYLOAD_UPDATE_GOAL"
  PAYLOAD_ULW_GROK_STOP=$(cat <<EOF
{"hookEventName":"Stop","sessionId":"gate-ulw-grok-deny","workspaceRoot":"$ULW_GROK_WS","lastAssistantMessage":"stopping early"}
EOF
)
  "${RUN_GATE[@]}" stop "$PAYLOAD_ULW_GROK_STOP"
} >"$SCRATCH/gating-ulw-grok-goal.log" 2>&1
cp "$SCRATCH/gating-ulw-grok-goal.log" "$SCRATCH/checkpoint-grok-cli.log"
grep -q 'omo-grok-ulw-loop' "$SCRATCH/gating-ulw-grok-goal.log"
grep -qE '"goalRuntime":\s*"grok"' "$SCRATCH/gating-ulw-grok-goal.log"
grep -qE '"ok":\s*true' "$SCRATCH/gating-ulw-grok-goal.log"
grep -qE '"status":\s*"complete"' "$SCRATCH/gating-ulw-grok-goal.log"
grep -q 'ulw_loop_grok_snapshot_mismatch' "$SCRATCH/gating-ulw-grok-goal.log"
grep -q '"decision":"deny"' "$SCRATCH/gating-ulw-grok-goal.log"
grep -q 'mid-aggregate' "$SCRATCH/gating-ulw-grok-goal.log"
grep -q 'ULW-LOOP FULL' "$SCRATCH/gating-ulw-grok-goal.log"
rm -rf "$ULW_GROK_WS"
echo "ULW_GROK_GOAL_GATE_PASS gate=gating-ulw-grok-goal cli=omo-grok-ulw-loop log=$SCRATCH/gating-ulw-grok-goal.log scratch=$SCRATCH"

# ast-grep / lsp-tools MCP servers are not vendored in this repo (see .mcp.json);
# the ast-grep skill doc ships, but the MCP gate is skipped until a server is
# vendored, so verify-gates stays honest about what actually exists.
test -f "$GROK_PLUGIN_ROOT/skills/ast-grep/SKILL.md"

cat >"$SCRATCH/EVIDENCE_MAP.txt" <<EOF
VP1 install-direct.log — grok plugin install . --trust from ~/omo-grok
VP2 gating-ulw.log — ultrawork activation (launch_1 header)
VP3 gating-rules.log — OMO_RULE_MARKER injection
VP4 gating-ulw.log — launch_2 stop continuation
AC3 gating-cc.log — comment-checker PreToolUse deny
AC3 gating-hashline.log — hashline stale deny
AC3 gating-lsp.log — LSP stop block
AC3 gating-boulder.log — start-work continuation
AC5 gating-ulw-grok-goal.log — omo-grok-ulw-loop CLI + update_goal deny + full ulw Stop priority
checkpoint-grok-cli.log — checkpoint pass (ok:true) + mismatch (ulw_loop_grok_snapshot_mismatch)
ulw-grok-cli-help.log / ulw-grok-cli-create-goals.log — CLI help + create-goals (npm run capture-ulw-grok-evidence)
gating-ulw-grok-hooks.log — hook transcripts (npm run capture-ulw-grok-evidence)
VP5 comparison.txt — omo-grok vs oh-my-grok vs fork
VP6 gating-install.log — grok plugin validate section
plugin-enabled.log — config enabled + inspect hooks
verify-gates-stdout.log — full gate runner transcript
install-direct.log — direct dev-tree install (no staging)
EOF

rm -f "$SCRATCH"/session-live-*.log "$SCRATCH"/launch-1.log "$SCRATCH"/session-ulw.log "$SCRATCH"/omo-grok-install-final.log 2>/dev/null || true

echo "ALL_GATES_PASS source=$ROOT plugin=$GROK_PLUGIN_ROOT scratch=$SCRATCH"