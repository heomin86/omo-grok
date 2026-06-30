---
name: comment-checker
description: Use when Grok CLI needs to understand or respond to automatic comment-checker feedback after Write or StrReplace.
---

# Grok Comment Checker

The omo-grok plugin registers a `PostToolUse` hook for successful `Write`, `StrReplace`, and `EditNotebook` calls.

When comment-checker reports a warning after an edit, Grok receives blocking feedback and should fix or explain the flagged comment before moving on.

## Scope

- No MCP tool is exposed.
- Non-edit tools are ignored.
- Missing checker binaries emit no hook output so normal work can continue.