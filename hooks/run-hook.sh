#!/usr/bin/env bash
set -euo pipefail
ROOT="${GROK_PLUGIN_ROOT:?GROK_PLUGIN_ROOT required}"
CMD="${1:?subcommand required}"
NODE="${NODE:-node}"
exec "$NODE" "$ROOT/dist/cli.js" "$CMD"