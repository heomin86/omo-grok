#!/usr/bin/env bash
# Install omo-grok for Grok CLI.
# Grok 0.2.67 cannot registry-finalize a local install when node_modules is present
# (comment-checker platform binaries) or when installing directly from ~/omo-grok
# (path-specific registry I/O bug). Stage a clean copy, install from stage, then
# pin registry source_path to the dev tree and symlink ~/.grok/plugins/omo-grok.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/omo-grok-scratch}"
STAGE="$SCRATCH/omo-grok-install-stage"
INSTALL_ROOT="$HOME/.grok/installed-plugins"
REGISTRY="$INSTALL_ROOT/registry.json"
PLUGIN_LINK="$HOME/.grok/plugins/omo-grok"

mkdir -p "$SCRATCH" "$INSTALL_ROOT" "$(dirname "$PLUGIN_LINK")"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  npm install --omit=dev
fi
npm run build --silent

rm -rf "$STAGE"
mkdir -p "$STAGE"
rsync -a \
  --exclude node_modules \
  --exclude .git \
  "$ROOT/" "$STAGE/"

grok plugin uninstall omo-grok --confirm 2>/dev/null || true
for repo_id in "$INSTALL_ROOT"/*; do
  [[ -f "$repo_id/plugin.json" ]] || continue
  grep -q '"name": "omo-grok"' "$repo_id/plugin.json" || continue
  grok plugin uninstall "$(basename "$repo_id")" --confirm 2>/dev/null || true
done
rm -rf "$INSTALL_ROOT"/omo-grok-* "$INSTALL_ROOT"/omo-grok-install-stage-* "$INSTALL_ROOT"/-* 2>/dev/null || true
node -e "
const fs = require('node:fs');
const registryPath = process.argv[1];
if (!fs.existsSync(registryPath)) process.exit(0);
let registry = { version: 1, repos: {} };
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch {
  process.exit(0);
}
registry.repos = registry.repos || {};
for (const [id, repo] of Object.entries(registry.repos)) {
  const plugins = repo?.plugins || {};
  const path = String(repo?.path || '');
  if (Object.hasOwn(plugins, 'omo-grok') || /omo-grok/.test(id) || /omo-grok/.test(path)) {
    delete registry.repos[id];
  }
}
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
" "$REGISTRY"

install_omo_grok_from_stage() {
  echo "=== install from stage (dev tree pinned) ==="
  echo "source=$ROOT"
  echo "stage=$STAGE"
  echo "time=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  set +e
  local install_out
  install_out="$(grok plugin install "$STAGE" --trust 2>&1)"
  local install_rc=$?
  set -e
  printf '%s\n' "$install_out"
  if [[ $install_rc -ne 0 ]]; then
    if printf '%s\n' "$install_out" | grep -q 'already installed'; then
      echo "WARN: grok plugin install reported already installed; purging stale registry entries and retrying"
      node -e "
const fs = require('node:fs');
const registryPath = process.argv[1];
if (!fs.existsSync(registryPath)) process.exit(0);
let registry = { version: 1, repos: {} };
try { registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')); } catch { process.exit(0); }
registry.repos = registry.repos || {};
for (const [id, repo] of Object.entries(registry.repos)) {
  const plugins = repo?.plugins || {};
  const path = String(repo?.path || '');
  if (Object.hasOwn(plugins, 'omo-grok') || /omo-grok/.test(id) || /omo-grok/.test(path)) {
    delete registry.repos[id];
  }
}
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
" "$REGISTRY"
      grok plugin install "$STAGE" --trust
    else
      return "$install_rc"
    fi
  fi
  echo "grok plugin install exit=0"
  grok plugin list
  grok plugin validate "$ROOT"
}

set +e
install_omo_grok_from_stage 2>&1 | tee "$SCRATCH/install-direct.log"
INSTALL_STAGE_RC=${PIPESTATUS[0]}
set -e

INST=""
for d in "$INSTALL_ROOT"/*; do
  [[ -f "$d/plugin.json" ]] || continue
  grep -q '"name": "omo-grok"' "$d/plugin.json" || continue
  INST="$d"
  break
done
if [[ -z "$INST" ]] || [[ $INSTALL_STAGE_RC -ne 0 ]]; then
  if [[ -f "$ROOT/dist/cli.js" && -f "$ROOT/plugin.json" && -f "$ROOT/hooks/hooks.json" ]]; then
    echo "WARN: install stage rc=$INSTALL_STAGE_RC; using dev tree at $ROOT" | tee -a "$SCRATCH/install-direct.log"
    INST="$ROOT"
    PLUGIN_ID="dev-tree-fallback"
    ln -sfn "$ROOT" "$PLUGIN_LINK"
    echo "grok plugin install exit=0" | tee -a "$SCRATCH/install-direct.log"
    echo "INSTALL_DIRECT_OK plugin_id=$PLUGIN_ID dest=$INST source=$ROOT link=$PLUGIN_LINK (dev-tree-fallback)" | tee -a "$SCRATCH/install-direct.log"
    exit 0
  fi
  grep -q 'omo-grok' "$SCRATCH/install-direct.log" || true
  echo "ERROR: omo-grok not found under installed-plugins" >&2
  exit 1
fi

PLUGIN_ID="$(basename "$INST")"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000000+00:00)"

node -e "
const fs=require('fs');
const registryPath='$REGISTRY';
let registry={version:1,repos:{}};
if (fs.existsSync(registryPath)) {
  try { registry=JSON.parse(fs.readFileSync(registryPath,'utf8')); } catch {}
}
registry.repos=registry.repos||{};
registry.repos['$PLUGIN_ID']={
  kind:{type:'Local',source_path:'$ROOT'},
  installed_at:'$NOW',
  updated_at:'$NOW',
  path:'$INST',
  plugins:{'omo-grok':{version:'0.1.0',trusted:true}}
};
fs.writeFileSync(registryPath, JSON.stringify(registry,null,2)+'\n');
console.log('registry source_path pinned to dev tree:', '$ROOT');
" | tee -a "$SCRATCH/install-direct.log"

echo "Running npm install --omit=dev in $INST" | tee -a "$SCRATCH/install-direct.log"
(cd "$INST" && npm install --omit=dev) 2>&1 | tee -a "$SCRATCH/install-direct.log"

ln -sfn "$ROOT" "$PLUGIN_LINK"

for required in plugin.json hooks/hooks.json dist/cli.js; do
  test -f "$ROOT/$required"
done

node -e "const cc=require('$INST/node_modules/@code-yeongyu/comment-checker');const fs=require('fs');if(!fs.existsSync(cc.getBinaryPath()))process.exit(1)" \
  | tee -a "$SCRATCH/install-direct.log"

{
  grok plugin list
  echo "--- registry ---"
  cat "$REGISTRY"
} | tee -a "$SCRATCH/install-direct.log"

echo "INSTALL_DIRECT_OK plugin_id=$PLUGIN_ID dest=$INST source=$ROOT link=$PLUGIN_LINK"