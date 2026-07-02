#!/usr/bin/env bash
# Register ~/omo-grok (or this repo) as a Repo Prompt / RepoPrompt CE workspace.
# Requires macOS + Repo Prompt app running. Safe to re-run (idempotent-ish).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="${REPOPROMPT_WORKSPACE_NAME:-omo-grok}"
LOG="${TMPDIR:-/tmp}/omo-grok-repoprompt-register.log"

log() { printf '%s\n' "$*" | tee -a "$LOG"; }

resolve_cli() {
  local candidates=(
    "${REPOPROMPT_CLI:-}"
    "$(command -v rp-cli 2>/dev/null || true)"
    "$(command -v rpce-cli-debug 2>/dev/null || true)"
    "$HOME/RepoPrompt/repoprompt_cli"
    "/Applications/Repo Prompt.app/Contents/MacOS/repoprompt-mcp"
    "/Applications/RepoPrompt CE.app/Contents/MacOS/repoprompt-mcp"
    "$HOME/Library/Application Support/RepoPrompt CE/repoprompt_ce_cli_debug"
  )
  for c in "${candidates[@]}"; do
    [[ -n "$c" && -x "$c" ]] || continue
    printf '%s' "$c"
    return 0
  done
  return 1
}

run_mcp() {
  local cli="$1"
  local json="$2"
  if "$cli" -c manage_workspaces -j "$json" >>"$LOG" 2>&1; then
    return 0
  fi
  return 1
}

try_register() {
  local cli="$1"
  log "Using CLI: $cli"
  log "Repo root: $ROOT"
  log "Workspace name: $NAME"

  local payloads=(
    "{\"op\":\"create\",\"name\":\"${NAME}\",\"roots\":[\"${ROOT}\"]}"
    "{\"op\":\"create\",\"name\":\"${NAME}\",\"root_paths\":[\"${ROOT}\"]}"
    "{\"op\":\"add_root\",\"name\":\"${NAME}\",\"path\":\"${ROOT}\"}"
    "{\"op\":\"add_folder\",\"name\":\"${NAME}\",\"path\":\"${ROOT}\"}"
  )

  for payload in "${payloads[@]}"; do
    log "Trying manage_workspaces: $payload"
    if run_mcp "$cli" "$payload"; then
      log "OK: workspace registered via manage_workspaces"
      "$cli" -e 'workspace list' 2>>"$LOG" | tee -a "$LOG" || true
      return 0
    fi
  done

  # Fallback: shell-style workspace command (Classic rp-cli)
  if "$cli" -e "workspace create --name ${NAME} --add-path ${ROOT}" >>"$LOG" 2>&1; then
    log "OK: workspace create via -e"
    return 0
  fi

  return 1
}

apply_compose_hints() {
  local cli="$1"
  local meta meta_path="$ROOT/.repoprompt/meta-prompt.md"
  [[ -f "$meta_path" ]] || return 0
  meta="$(python3 -c 'import json,sys; print(json.dumps(open(sys.argv[1], encoding="utf-8").read()))' "$meta_path" 2>/dev/null || true)"
  [[ -n "$meta" ]] || return 0

  log "Setting shared prompt prefix from .repoprompt/meta-prompt.md (best-effort)…"
  run_mcp "$cli" "{\"op\":\"switch\",\"name\":\"${NAME}\"}" || true
  "$cli" -c prompt -j "{\"op\":\"append\",\"text\":${meta}}" >>"$LOG" 2>&1 || \
    "$cli" -e 'prompt append --file '"$meta_path" >>"$LOG" 2>&1 || \
    log "WARN: could not auto-set prompt; paste .repoprompt/meta-prompt.md manually in Compose."
}

main() {
  : >"$LOG"
  log "=== omo-grok Repo Prompt registration ==="
  log "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    log "ERROR: Repo Prompt is macOS-only. Run this script on your Mac where Repo Prompt is installed."
    log "Manual: Repo Prompt → Manage Workspaces → Add Folders → $ROOT"
    exit 1
  fi

  local cli=""
  if ! cli="$(resolve_cli)"; then
    log "ERROR: Repo Prompt CLI not found."
    log "Install Repo Prompt CE: brew tap repoprompt/repoprompt-ce && brew install --cask repoprompt-ce"
    log "Then open the app once, or set REPOPROMPT_CLI to your rp-cli / repoprompt-mcp path."
    log "Manual: Manage Workspaces → Create → Add Folders → $ROOT (name: $NAME)"
    exit 1
  fi

  if try_register "$cli"; then
    apply_compose_hints "$cli"
    log ""
    log "Next steps in Repo Prompt:"
    log "  1. Switch to workspace '$NAME' if needed"
    log "  2. Add files from .repoprompt/default-selection.txt to your selection"
    log "  3. Use .repoprompt/user-instructions.md as a task template"
    log "Log: $LOG"
    exit 0
  fi

  log "ERROR: automatic registration failed. See log: $LOG"
  log ""
  log "Manual registration:"
  log "  1. Open Repo Prompt CE"
  log "  2. Manage Workspaces → Create a New Workspace"
  log "  3. Add Folders → $ROOT"
  log "  4. Name: $NAME"
  log "  5. Compose → paste .repoprompt/meta-prompt.md and select default-selection.txt paths"
  exit 1
}

main "$@"
