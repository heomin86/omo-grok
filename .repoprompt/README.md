# Repo Prompt project bundle — omo-grok

English · See [main README](../README.md#repo-prompt) for full setup.

This folder is a **project profile** for [Repo Prompt](https://repoprompt.com) / [RepoPrompt CE](https://github.com/repoprompt/repoprompt-ce). It is not read automatically by Grok; use it when curating context in Repo Prompt.

| File | Purpose |
| --- | --- |
| `project-profile.json` | Machine-readable metadata (name, tags, artifact paths) |
| `meta-prompt.md` | Paste into Compose → **Meta prompt** (or append to shared prompt) |
| `default-selection.txt` | Paths to pre-select in the file tree (one path per line) |
| `user-instructions.md` | Template for Compose → **User instructions** |

## Quick import (macOS)

1. Open **Repo Prompt CE** (or Repo Prompt).
2. **Manage Workspaces** → **Create a New Workspace** → **Add Folders** → choose this repo (`~/omo-grok`).
3. Name the workspace **`omo-grok`**.
4. In Compose, load selection from `default-selection.txt` (add paths from the list).
5. Set meta prompt from `meta-prompt.md`.

Or run from the repo root (Repo Prompt app must be running):

```bash
bash scripts/register-repoprompt-workspace.sh
```

한국어 안내는 [README.ko.md](../README.ko.md#repo-prompt)를 참고하세요.
