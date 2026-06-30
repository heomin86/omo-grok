---
name: hashline-edit
description: >
  Hash-anchored StrReplace edits using LINE#ID tags from Read output. PreToolUse
  blocks stale anchors when the file changed since the last cached read.
user_invocable: false
---

# Hashline edits (LINE#ID)

omo-grok caches per-line hashes after each workspace **Read**. Use those tags in `StrReplace` `old_string` for conflict-safe edits.

## Format

```text
{line}#{hash}|{content}
```

- **line**: 1-based line number
- **hash**: two letters from `ZPMQVRWSNKTXJBYH`
- Copy tags exactly — never guess hashes

## Workflow

1. **Read** the target file (hooks refresh the hashline cache).
2. Copy `LINE#ID` anchors into `old_string`.
3. **StrReplace**; re-read before a second edit on the same file.
4. If PreToolUse denies with “stale LINE#ID”, **Read** again and use updated tags.

## Configuration

| Variable | Default | Effect |
|----------|---------|--------|
| `OMO_HASHLINE` | `1` | `0` disables cache + PreToolUse guard |