#!/usr/bin/env bash
# One-shot SCRATCH evidence refresh for ulw-loop Grok goal verification.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-/var/folders/q7/sw9lqwgs0yndxsytmc3w019m0000gn/T/grok-goal-647755b4e031/implementer}"
export SCRATCH
export GROK_SKIP_PLUGIN_INSTALL=1
export RUN_VERIFY_GATES=1
mkdir -p "$SCRATCH"
cd "$ROOT"
npm run build --silent
SCRATCH="$SCRATCH" npm test 2>&1 | tee "$SCRATCH/npm-test-run3.log"
SCRATCH="$SCRATCH" npm test 2>&1 | tee "$SCRATCH/npm-test-run4.log"
npm run populate-scratch-evidence 2>&1 | tee "$SCRATCH/populate-scratch-evidence.log"
npm run run-user-verification 2>&1 | tee "$SCRATCH/run-user-verification.log"
grep -q ALL_GATES_PASS "$SCRATCH/verify-gates-stdout.log"
grep -q '"ok": true' "$SCRATCH/checkpoint-grok-cli.log"
grep -q sha256= "$SCRATCH/CHANGED_FILES_omo-grok.txt"
echo "SCRATCH_VERIFICATION_OK scratch=$SCRATCH"