---
name: ast-grep
description: >
  Structural code search and rewrite via the bundled ast_grep MCP server.
  Use for AST patterns ($VAR, $$$), not regex. Prefer over Grep when matching syntax trees.
user_invocable: true
---

# AST-Grep (MCP `ast_grep`)

Bundled server: `node ${GROK_PLUGIN_ROOT}/vendor/ast-grep-mcp/dist/cli.js mcp`

## When to use

- Find or rewrite **syntax-shaped** code (functions, imports, classes, control flow)
- Refactors that must respect language grammar (25 languages)

## When **not** to use

- Plain text, alternation (`foo|bar`), or regex wildcards → use **Grep** / `rg` instead

## Tools (via MCP, server `ast_grep`)

| Tool | Purpose |
|------|---------|
| `search` | AST pattern search (`pattern`, `lang`, optional `paths`, `globs`, `context`) |
| `replace` | AST rewrite (`pattern`, `rewrite`, `lang`; `dryRun` defaults to **true**) |

## Pattern syntax

- `$VAR` — one AST node
- `$$$` — zero or more nodes
- Patterns must be **valid source** for the chosen `lang`

After structural edits, run `lsp.diagnostics` on touched files.