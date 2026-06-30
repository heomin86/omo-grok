---
name: lsp
description: Use when Grok CLI needs language-server diagnostics, definitions, references, symbols, or rename safety checks in the current workspace.
---

# Grok LSP

Call `lsp` MCP tools through the tool interface; `lsp.*` / `mcp__lsp__*` are tool-call names, not shell commands.

Bundled server: `node ${GROK_PLUGIN_ROOT}/vendor/lsp-tools-mcp/dist/cli.js mcp`

## Tools

- `lsp.status`: list configured, installed, missing, disabled, and active language servers.
- `lsp.diagnostics`: check one file or directory for LSP diagnostics. Prefer `severity: "error"` after edits.
- `lsp.goto_definition`, `lsp.find_references`, `lsp.symbols`, `lsp.prepare_rename`, `lsp.rename`

## Stop enforcement

After `Write` / `StrReplace`, omo-grok stashes error-level diagnostics. The **Stop** hook blocks until errors are cleared (disable with `OMO_LSP_ENFORCE=0`).

## Config

Project config: `.grok/lsp-client.json` or `.codex/lsp-client.json` (compat); user config: `~/.grok/lsp-client.json`.

Use `lsp.status` first when diagnostics report a missing language server.