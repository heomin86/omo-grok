# Task template (paste into Repo Prompt Compose → User Instructions)

Replace `<TASK>` with your objective.

---

## Objective

<TASK>

## Context

- Target: **omo-grok** Grok Build plugin (`~/omo-grok`)
- Branch: check `git branch --show-current` before editing
- User-facing docs: English `README.md` + Korean `README.ko.md`

## Constraints

- `/goal` is user-run; agent handoff must print the exact `/goal` line for the user
- Grok delegation uses `spawn_subagent`, not Codex `Task`
- Run `npm test` before claiming done

## Deliverable

- Code change with tests passing
- README updates if behavior changed
- Short summary of how to verify in Grok Build (`/goal` or `/ulw-loop`)
