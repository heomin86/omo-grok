#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/omo-grok-scratch}"
WS="${WS:-$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-live.XXXXXX")}"
RUN_GATE=(node "$ROOT/scripts/run-gate.mjs")

resolve_plugin_root() {
  local path
  path="$(ls -d "$HOME/.grok/installed-plugins"/omo-grok-* 2>/dev/null | head -1 || true)"
  if [[ -n "$path" && -f "$path/dist/cli.js" ]]; then
    echo "$path"
    return
  fi
  echo "$ROOT"
}

export GROK_PLUGIN_ROOT="$(resolve_plugin_root)"
export GROK_HOME="${GROK_HOME:-$HOME/.grok}"
mkdir -p "$SCRATCH" "$WS/.omo/rules" "$WS/.omo/live-verify"

LIVE_FILE="$WS/.omo/live-verify/slop-target.ts"
HASH_FILE="$WS/.omo/live-verify/hashline-target.ts"
LSP_FILE="$WS/.omo/live-verify/lsp-target.ts"
LIVE_CC_MARKER="LIVE_CC_MARKER_$(date +%s)"

cat >"$LIVE_FILE" <<'EOF'
export const liveVerify = 1;
EOF
cat >"$HASH_FILE" <<'EOF'
export const hashlineLive = "v1";
EOF
cat >"$LSP_FILE" <<'EOF'
export const lspLive = true;
EOF

SESSION_RULES="live-rules-$(date +%s)"
{
  echo "=== live rules on $WS ==="
  "${RUN_GATE[@]}" user-prompt "$(cat <<EOF
{"hookEventName":"UserPromptSubmit","sessionId":"${SESSION_RULES}","workspaceRoot":"${WS}","prompt":"check rules"}
EOF
)"
} >"$SCRATCH/session-live-rules.log" 2>&1

SESSION_CC="live-cc-$(date +%s)"
{
  echo "=== live comment-checker marker=$LIVE_CC_MARKER file=$LIVE_FILE ==="
  "${RUN_GATE[@]}" post-tool-comment-checker "$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${SESSION_CC}","workspaceRoot":"${WS}","toolName":"StrReplace","toolInput":{"path":".omo/live-verify/slop-target.ts","old_string":"export const liveVerify = 1;","new_string":"// LIVE_CC_UNIQUE_SLOP: remove before merge\nexport const liveVerify = 2;"},"toolResponse":"ok"}
EOF
)"
} >"$SCRATCH/session-live-cc.log" 2>&1

SESSION_HASH="live-hash-$(date +%s)"
HASH_HOME="$SCRATCH/live-hash-home-$(date +%s)"
mkdir -p "$HASH_HOME"
export GROK_HOME="$HASH_HOME"
{
  echo "=== live hashline on $HASH_FILE workspace=$WS ==="
  "${RUN_GATE[@]}" post-tool-read "$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${SESSION_HASH}","workspaceRoot":"${WS}","toolName":"Read","toolInput":{"path":".omo/live-verify/hashline-target.ts"}}
EOF
)"
  STALE_HASH="$(node -e "
const fs=require('fs');const crypto=require('crypto');const {resolve}=require('path');
const home='$HASH_HOME';const ws='$WS';const rel='.omo/live-verify/hashline-target.ts';
const abs=resolve(ws,rel);
const digest=crypto.createHash('sha256').update(abs).digest('hex');
const cache=JSON.parse(fs.readFileSync(home+'/state/hashline/${SESSION_HASH}/'+digest+'.json','utf8'));
console.log(cache.lines['1']);
")"
  echo "--- mutate disk then re-read to refresh cache ---"
  printf '%s\n' 'export const hashlineLive = "v2";' >"$HASH_FILE"
  "${RUN_GATE[@]}" post-tool-read "$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${SESSION_HASH}","workspaceRoot":"${WS}","toolName":"Read","toolInput":{"path":".omo/live-verify/hashline-target.ts"}}
EOF
)" >/dev/null
  echo "--- deny stale LINE#ID from prior read ---"
  "${RUN_GATE[@]}" pre-tool-hashline "$(cat <<EOF
{"hookEventName":"PreToolUse","sessionId":"${SESSION_HASH}","workspaceRoot":"${WS}","toolName":"StrReplace","toolInput":{"path":".omo/live-verify/hashline-target.ts","old_string":"1#${STALE_HASH}","new_string":"export const hashlineLive = \"v3\";"}}
EOF
)"
} >"$SCRATCH/session-live-hashline.log" 2>&1
unset GROK_HOME

SESSION_LSP="live-lsp-$(date +%s)"
LSP_HOME="$SCRATCH/live-lsp-home-$(date +%s)"
mkdir -p "$LSP_HOME"
export GROK_HOME="$LSP_HOME"
export OMO_LSP_MOCK_DIAG="error[typescript] (2:1): LIVE_LSP_MARKER type mismatch on ${LSP_FILE}"
{
  echo "=== live LSP stash+stop on $LSP_FILE workspace=$WS ==="
  "${RUN_GATE[@]}" post-tool-lsp "$(cat <<EOF
{"hookEventName":"PostToolUse","sessionId":"${SESSION_LSP}","workspaceRoot":"${WS}","toolName":"StrReplace","toolInput":{"path":".omo/live-verify/lsp-target.ts"}}
EOF
)"
  "${RUN_GATE[@]}" stop "$(cat <<EOF
{"hookEventName":"Stop","sessionId":"${SESSION_LSP}","workspaceRoot":"${WS}","lastAssistantMessage":"attempting stop with lsp errors"}
EOF
)"
} >"$SCRATCH/session-live-lsp.log" 2>&1
unset OMO_LSP_MOCK_DIAG
unset GROK_HOME

SESSION_BOULDER="live-boulder-$(date +%s)"
ULW_DIR="$WS/.omo/ulw-loop/${SESSION_BOULDER//[^A-Za-z0-9._-]/-}"
rm -rf "$ULW_DIR"
mkdir -p "$WS/.omo/plans"
cat >"$WS/.omo/plans/live-plan.md" <<'EOF'
# Live plan

## TODOs
- [ ] Finish live boulder verification
EOF
cat >"$WS/.omo/boulder.json" <<EOF
{
  "schema_version": 2,
  "active_work_id": "live_work",
  "works": {
    "live_work": {
      "work_id": "live_work",
      "active_plan": ".omo/plans/live-plan.md",
      "plan_name": "live-plan",
      "status": "active",
      "started_at": "2026-06-27T11:00:00.000Z",
      "session_ids": ["codex:${SESSION_BOULDER}"]
    }
  },
  "active_plan": ".omo/plans/live-plan.md",
  "plan_name": "live-plan",
  "status": "active",
  "session_ids": ["codex:${SESSION_BOULDER}"]
}
EOF

{
  echo "=== live boulder stop (non-ulw) on $WS ==="
  "${RUN_GATE[@]}" stop "$(cat <<EOF
{"hookEventName":"Stop","sessionId":"${SESSION_BOULDER}","workspaceRoot":"${WS}","lastAssistantMessage":"wrapping up"}
EOF
)"
} >"$SCRATCH/session-live-stop.log" 2>&1

grep -q 'OMO_RULE_MARKER' "$SCRATCH/session-live-rules.log"
grep -q "$LIVE_CC_MARKER" "$SCRATCH/session-live-cc.log"
grep -q 'LIVE_CC_UNIQUE_SLOP' "$SCRATCH/session-live-cc.log"
grep -q '.omo/live-verify/slop-target.ts' "$SCRATCH/session-live-cc.log"
grep -q '"decision":"block"' "$SCRATCH/session-live-cc.log"
grep -q 'hashline-target.ts' "$SCRATCH/session-live-hashline.log"
grep -q '"decision":"deny"' "$SCRATCH/session-live-hashline.log"
grep -q 'stale LINE#ID' "$SCRATCH/session-live-hashline.log"
grep -q 'LIVE_LSP_MARKER' "$SCRATCH/session-live-lsp.log"
grep -q 'lsp-target.ts' "$SCRATCH/session-live-lsp.log"
grep -q '"decision":"block"' "$SCRATCH/session-live-lsp.log"
grep -q 'start-work-continuation' "$SCRATCH/session-live-stop.log"
grep -q '"decision":"block"' "$SCRATCH/session-live-stop.log"

echo "LIVE_EXERCISE_OK workspace=$WS plugin=$GROK_PLUGIN_ROOT marker=$LIVE_CC_MARKER"