#!/usr/bin/env bash
# Capture ulw-loop × Grok goal gate evidence per plan verification steps 1–3.
# Usage: SCRATCH=/path/to/implementer bash scripts/capture-ulw-grok-gate-evidence.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/omo-grok-scratch}"
ULW_LOOP_BIN="$ROOT/components/ulw-loop/dist/cli.js"
RUN_GATE=(node "$ROOT/scripts/run-gate.mjs")

mkdir -p "$SCRATCH"
cd "$ROOT"
npm run build --silent

test -f "$ULW_LOOP_BIN"

{
  echo "=== ulw-grok-cli-help ==="
  node "$ULW_LOOP_BIN" help
  echo "=== ulw-grok-cli-help-repeat ==="
  node "$ULW_LOOP_BIN" help
} >"$SCRATCH/ulw-grok-cli-help.log" 2>&1

CLI_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-ulw-cli-gate.XXXXXX")"
trap 'rm -rf "$CLI_WS" "$CHK_WS" "$HOOK_WS"' EXIT
CHK_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-ulw-chk-gate.XXXXXX")"
HOOK_WS="$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-ulw-hook-gate.XXXXXX")"

{
  echo "=== create-goals run 1 ==="
  (
    cd "$CLI_WS"
    node "$ULW_LOOP_BIN" create-goals --goal-runtime grok --brief "Gate fixture brief for Grok ulw-loop" --json
  )
  echo "=== create-goals run 2 (idempotent refusal) ==="
  (
    cd "$CLI_WS"
    node "$ULW_LOOP_BIN" create-goals --goal-runtime grok --brief "Gate fixture brief for Grok ulw-loop" --json 2>&1 || true
  )
} >"$SCRATCH/ulw-grok-cli-create-goals.log" 2>&1

SEED_VARS="$(node "$ROOT/scripts/seed-ulw-grok-gate-fixture.mjs" "$CHK_WS")"
eval "$SEED_VARS"
PASS_SNAPSHOT=$(node -e 'process.stdout.write(JSON.stringify({ objective: process.argv[1], status: "active" }))' "$AGGREGATE_OBJECTIVE")

{
  echo "=== seed fixture ==="
  echo "GOAL_ID=$GOAL_ID"
  echo "AGGREGATE_OBJECTIVE=$AGGREGATE_OBJECTIVE"
  echo "PASS_SNAPSHOT=$PASS_SNAPSHOT"
  echo "=== checkpoint pass (matching aggregate snapshot) ==="
  (
    cd "$CHK_WS"
    node "$ULW_LOOP_BIN" checkpoint --goal-runtime grok --goal-id "$GOAL_ID" --status complete \
      --evidence "gate pass: implementation and validation evidence for G001" \
      --grok-goal-json "$PASS_SNAPSHOT" --json
  )
  echo "=== re-seed for mismatch ==="
  node "$ROOT/scripts/seed-ulw-grok-gate-fixture.mjs" "$CHK_WS" >/dev/null
  echo "=== checkpoint mismatch (wrong objective) ==="
  (
    cd "$CHK_WS"
    node "$ULW_LOOP_BIN" checkpoint --goal-runtime grok --goal-id "$GOAL_ID" --status complete \
      --evidence "gate mismatch evidence" \
      --grok-goal-json '{"objective":"WRONG aggregate objective","status":"active"}' --json 2>&1 || true
  )
} >"$SCRATCH/checkpoint-grok-cli.log" 2>&1

node "$ROOT/scripts/seed-ulw-grok-gate-fixture.mjs" "$HOOK_WS" >/dev/null
PAYLOAD_UPDATE_GOAL=$(cat <<EOF
{"hookEventName":"PreToolUse","sessionId":"gate-ulw-grok-deny","workspaceRoot":"$HOOK_WS","toolName":"update_goal","toolInput":{"completed":true,"message":"too early"}}
EOF
)
PAYLOAD_ULW_GROK_STOP=$(cat <<EOF
{"hookEventName":"Stop","sessionId":"gate-ulw-grok-deny","workspaceRoot":"$HOOK_WS","lastAssistantMessage":"stopping early"}
EOF
)
{
  echo "=== PreToolUse update_goal deny ==="
  "${RUN_GATE[@]}" pre-tool-update-goal "$PAYLOAD_UPDATE_GOAL"
  echo "=== Stop full ulw priority ==="
  "${RUN_GATE[@]}" stop "$PAYLOAD_ULW_GROK_STOP"
} >"$SCRATCH/gating-ulw-grok-hooks.log" 2>&1

grep -q 'omo-grok-ulw-loop' "$SCRATCH/ulw-grok-cli-help.log"
grep -q '"goalRuntime": "grok"' "$SCRATCH/ulw-grok-cli-create-goals.log"
grep -qE '"ok":\s*true' "$SCRATCH/checkpoint-grok-cli.log"
grep -q 'ulw_loop_grok_snapshot_mismatch' "$SCRATCH/checkpoint-grok-cli.log"
grep -q '"decision":"deny"' "$SCRATCH/gating-ulw-grok-hooks.log"
grep -q 'ULW-LOOP FULL' "$SCRATCH/gating-ulw-grok-hooks.log"

echo "ULW_GROK_GATE_EVIDENCE_OK scratch=$SCRATCH"