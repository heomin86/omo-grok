#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRATCH="${SCRATCH:-${TMPDIR:-/tmp}/omo-grok-scratch}"

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
MCP_CLI="$GROK_PLUGIN_ROOT/vendor/ast-grep-mcp/dist/cli.js"
WORKSPACE="${WORKSPACE:-$(mktemp -d "${TMPDIR:-/tmp}/omo-grok-astgrep.XXXXXX")}"
LIVE_DIR="$WORKSPACE/.omo/live-verify"
TARGET="$LIVE_DIR/ast-grep-target.ts"

mkdir -p "$SCRATCH" "$LIVE_DIR"
cat >"$TARGET" <<'EOF'
export const astGrepLiveProbe = 42;
EOF

{
  echo "=== ast-grep MCP callable probe ==="
  echo "plugin=$GROK_PLUGIN_ROOT"
  echo "target=$TARGET"
  test -f "$MCP_CLI"
  node "$MCP_CLI" mcp --help 2>&1 | head -3 || true
  node -e "
const {spawn}=require('child_process');
const cli=process.argv[1];
const target=process.argv[2];
const child=spawn(process.execPath,[cli,'mcp'],{stdio:['pipe','pipe','inherit'],cwd:'$WORKSPACE'});
let buf='';
child.stdout.on('data',c=>{buf+=c;});
const init={jsonrpc:'2.0',id:0,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'omo-grok-verify',version:'1'}}};
const rel='.omo/live-verify/ast-grep-target.ts';
const req={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'search',arguments:{pattern:'export const \$VAR = \$VAL',lang:'typescript',paths:[rel]}}};
child.stdin.write(JSON.stringify(init)+'\n');
setTimeout(()=>{
  child.stdin.write(JSON.stringify(req)+'\n');
  child.stdin.end();
},200);
child.on('close',code=>{
  const lines=buf.trim().split('\n').filter(Boolean);
  const last=lines[lines.length-1]||'';
  let parsed;
  try { parsed=JSON.parse(last); } catch { console.error('NO_JSON_RESPONSE',last.slice(0,200)); process.exit(1); }
  const text=JSON.stringify(parsed);
  if (!/astGrepLiveProbe/.test(text)) { console.error('MISSING_MATCH',text.slice(0,400)); process.exit(1); }
  console.log('AST_GREP_MCP_OK match=astGrepLiveProbe');
  process.exit(code??0);
});
" "$MCP_CLI" "$TARGET"
} >"$SCRATCH/gating-ast-grep.log" 2>&1

grep -q 'AST_GREP_MCP_OK' "$SCRATCH/gating-ast-grep.log"
echo "AST_GREP_GATE_PASS scratch=$SCRATCH"