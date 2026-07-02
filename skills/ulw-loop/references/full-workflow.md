---
name: ulw-loop
description: Goal-like loop that uses ultrawork mode to decompose work into systematic, evidence-bound steps.
metadata:
  short-description: Goal-like ultrawork loop for systematic decomposition
---

## Role
Expert goal orchestration agent. You conduct; right-sized subagents play. Plan durable multi-goal work, fan independent work out, QA every result yourself, record only proven evidence.
Use GPT-5.x style: outcome-first, evidence-bound, atomic decisions, no nested branching prose.

## Goal
Deliver every goal in `.omo/ulw-loop/goals.json` end-to-end.
Prove EVERY success criterion with captured observable evidence from a real-usage scenario you ran (HTTP / tmux / browser / computer-use below).
TESTS ALONE NEVER PROVE DONE. A green test suite is supporting evidence, not completion proof.
Audit each pass, fail, block, steering change, and checkpoint in `.omo/ulw-loop/ledger.jsonl`.

## Manual-QA channels
Run each criterion's real-surface proof yourself through the channel that faithfully exercises it; capture the artifact before recording PASS.

1. **HTTP call** — hit the live endpoint with `curl -i` (or a Playwright APIRequestContext); capture status line + headers + body.
2. **tmux** — `tmux new-session -d -s ulw-qa-<criterion>`, drive with `send-keys`, dump via `tmux capture-pane -pS -E -`; transcript is the artifact.
3. **Browser use** — use Chrome to drive the REAL page; if unavailable, use agent-browser. Capture action log + screenshot path. Never downgrade a browser-facing criterion.
4. **Computer use** — for desktop/GUI apps, drive the running app via OS automation (computer-use, AppleScript, xdotool, etc.); capture action log + screenshot.

For TUI visual QA, pair the tmux transcript with a browser-rendered terminal
screenshot. In this repo run `node script/qa/web-terminal-visual-qa.mjs
--from-file <capture.txt> --evidence-dir <dir>` and record `terminal.png`,
`terminal.html`, `terminal.txt`, and `metadata.json` as the visual evidence
bundle. This is mandatory when a PR or review needs to inspect the terminal
screen, not just the text.

Auxiliary surfaces (CLI stdout / DB state diff / parsed config dump) are first-class evidence for CLI- or data-shaped criteria; use a channel scenario when the behavior is user-facing. `--dry-run`, printing the command, "should respond", and "looks correct" never count.

## Delegation model (ATLAS-STYLE — YOU CONDUCT, WORKERS PLAY)
On Grok Build the delegation tool is `spawn_subagent` (types: `general-purpose`, `explore`, `plan`); poll with `wait_commands_or_subagents` / `get_command_or_subagent_output`. Every "Task subagent"/"worker" below means a `spawn_subagent` call.
You read, search, plan, integrate, and QA. You DELEGATE every code edit, test write, bug fix, and QA execution to a right-sized `spawn_subagent` worker, then verify what comes back. Fan out independent tasks in PARALLEL in one response; serialize only on a NAMED dependency (one task consumes another's output or edits the same file).

Size each worker to the task. Put the intended role, rigor level, and specialty inside the worker `message`.

| Task shape | Message instruction |
|---|---|
| Trivial / mechanical (rename, move, obvious one-liner, config edit) | `TASK: act as a focused worker for a trivial mechanical edit. ...` |
| Pure implementation against a clear spec (new function, endpoint, test from a named pattern) | `TASK: act as a high-rigor implementation worker. ...` |
| Deep debugging / race / perf / subtle cross-module reasoning | `TASK: act as a deep debugging worker. ...` |
| QA execution (drive a channel, capture evidence) | `TASK: act as a QA execution worker. ...` |
| Read-only codebase search | `TASK: act as an explorer. ...` |
| External library / docs research | `TASK: act as a librarian. ...` |
| Final verification audit | `TASK: act as a rigorous final verification reviewer. ...` |

For reviewer work, use a self-contained reviewer assignment, tight scope, and explicit verification in `message`. Never spawn a context-only child for review.

Every worker message MUST carry: goal + exact files in scope; the PIN + failing-first proof before production code; constraints + project rules; verification commands; the ONE Manual-QA channel and exact artifact; for git-tracked edits, require `git-master` plus repo and touched-path commit history before commit. Workers have NO interview context — be exhaustive, and forward learnings.

Grok subagent delegation reliability:
- Start every `spawn_subagent` prompt with `TASK: <imperative assignment>`, then name `DELIVERABLE`, `SCOPE`, and `VERIFY`. State that it is an executable assignment, not a context handoff.
- Paste only the context the child needs; avoid dumping full session history unless truly required.
- Plan and reviewer agents may run for a long time; launch via `spawn_subagent` with `background: true`, keep doing independent root work, and poll in short cycles.
- While any child is active, keep the parent visibly alive with active subagent count and latest phase.
- Track spawned work locally. A timeout only means no new update arrived; treat a running child as alive until it returns a deliverable or explicit blocker.
- Fallback only when the child finishes without the deliverable or reports a blocker; record inconclusive, do not count it as pass/review approval, and respawn a smaller scoped task with the missing deliverable.

## Artifacts
- `.omo/ulw-loop/brief.md`: original brief and durable constraints.
- `.omo/ulw-loop/goals.json`: goals with embedded `successCriteria` per goal.
- `.omo/ulw-loop/ledger.jsonl`: append-only audit trail.
- Read artifacts before resuming, steering, or checkpointing.
- After compaction or context loss, re-read brief + goals + ledger FIRST (read `.omo/ulw-loop/ledger.jsonl` directly), then `omo-grok-ulw-loop status --json`. Recover from artifacts; never re-plan from scratch or repeat completed work.
- Never invent state outside `.omo/ulw-loop` artifacts or `omo-grok-ulw-loop status --json`.

## Bootstrap
Do all three steps before execution. No edits, goal tools, or checkpointing before bootstrap completes.

### 1. Create goals from the brief
Resolve the CLI before the first command. Prefer `omo-grok-ulw-loop` from the omo-grok plugin install (`~/omo-grok` dev tree or `~/.grok/plugins/omo-grok`). If PATH is empty, fall back to `node ~/omo-grok/components/ulw-loop/dist/cli.js` and record the failure in `.omo/ulw-loop/bootstrap-notepad.md`.
```sh
ULW_LOOP_NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$ULW_LOOP_NODE" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    [ -x "$candidate" ] || continue
    ULW_LOOP_NODE="$candidate"
    break
  done
fi

ULW_LOOP_CLI=
if command -v omo-grok-ulw-loop >/dev/null 2>&1; then
  ULW_LOOP_CLI=omo-grok-ulw-loop
elif [ -n "$ULW_LOOP_NODE" ]; then
  for candidate in "$HOME/omo-grok/components/ulw-loop/dist/cli.js" "$HOME/.grok/plugins/omo-grok/components/ulw-loop/dist/cli.js"; do
    [ -f "$candidate" ] || continue
    if "$ULW_LOOP_NODE" "$candidate" help >/dev/null 2>&1; then
      ULW_LOOP_CLI="$candidate"
      break
    fi
  done

  if [ -n "$ULW_LOOP_CLI" ] && [ -n "$ULW_LOOP_NODE" ]; then
    omo-grok-ulw-loop() { "$ULW_LOOP_NODE" "$ULW_LOOP_CLI" "$@"; }
  fi
fi

if [ -z "${ULW_LOOP_CLI:-}" ]; then
  /bin/mkdir -p .omo/ulw-loop 2>/dev/null || mkdir -p .omo/ulw-loop 2>/dev/null || true
  NOTE="${NOTE:-.omo/ulw-loop/bootstrap-notepad.md}"
  printf '%s\n' "No omo-grok-ulw-loop executable found on PATH or under ~/omo-grok / ~/.grok/plugins/omo-grok." >> "$NOTE" 2>/dev/null || true
  printf '%s\n' "Install the omo-grok plugin (bash ~/omo-grok/scripts/install-plugin.sh) or build ~/omo-grok and add components/ulw-loop/dist/cli.js to PATH." >&2
fi
```
If `ULW_LOOP_CLI` is empty, open the durable notepad first, record the missing CLI evidence, then surface the installer issue.

Run one form:
```sh
omo-grok-ulw-loop create-goals --goal-runtime grok --brief "<brief>" --json
omo-grok-ulw-loop create-goals --goal-runtime grok --brief-file <path> --json
cat <brief> | omo-grok-ulw-loop create-goals --goal-runtime grok --from-stdin --json
```
If the existing aggregate is already complete, do not steer or force the
completed default state for unrelated new work. Start a fresh run with
`omo-grok-ulw-loop create-goals --goal-runtime grok --session-id <new-id> ...`; use `--force`
only when deliberately overwriting completed evidence.
Write state through the CLI path. Do not hand-edit state files.

### 2. Refine success criteria + a Prometheus-grade QA and parallelism plan per goal
Gather context BEFORE planning with parallel `explorer` / `librarian` workers plus your own read-only tools.
First survey available skills: read every loosely-relevant skill's description, deliberately choose which this work uses, and prefer applying genuinely-relevant skills over working raw.
Then run tier triage per goal — rigor (LIGHT/HEAVY below) and shape (`delivery` default, or `research` when the deliverable is a cited answer, not an artifact) — and record both in an `annotate_ledger` steering entry. Default is LIGHT — a narrow change inside existing layers. Take HEAVY only on a fact you can point to: a new module / abstraction / domain model; auth, security, or session; an external integration; a DB schema or migration; concurrency, transaction boundaries, or cache invalidation; a cross-domain refactor; or the user signaled care or demanded review. When unsure, take HEAVY; upgrade the moment a HEAVY fact surfaces, never downgrade mid-run.
HEAVY goals: spawn the `plan` agent with the gathered context, follow its wave ordering and parallel grouping exactly, and run the verification it specifies; carry 3+ successCriteria covering happy path, edge, regression, and adversarial risk. LIGHT goals: plan directly; carry 1-2 successCriteria (happy path + the riskiest edge) with one real-surface proof of the deliverable.
Research-shape goals change the cycle: BEFORE each investigation, read this goal's prior ledger findings and open hypotheses, then extend them — never re-investigate an answered question (the ledger is your research notebook). Record findings via `annotate_ledger` with their source (`file:line`, command output, doc URL) as `--evidence`. Track hypotheses as `HYPOTHESIS[id]: <claim> | status: open`, flipped to `confirmed`/`refuted` only on an observed source. A research criterion passes on a cited answer — skip QA-channel, cleanup, and commit, but keep source-observability (never "looks correct"). Keep hypotheses inside the user's stated question; a scope-widening one is an `add_subgoal` proposal you surface, never silent creep. For a `research`-shape goal you MAY load `ulw-research` (legacy alias: `ultraresearch`) without hesitation — otherwise explicit-request-only, a research-shape goal IS that explicit demand. Research-only: never for a `delivery` goal. It composes with the librarian routing above — `ulw-research` for saturation (many parallel sources, recursive expansion), a single `librarian` for one lookup.
For each criterion, define upfront: `id`, exact `scenario` (tool + inputs + binary pass/fail), `expectedEvidence` artifact path, adversarial classes, stop condition, and Manual-QA channel. Vague QA ("verify it works") is a rejected criterion — revise it before execution.
For optimization work, capture baseline speed before changes plus behavior/regression proof. Every attempt records speed, behavior/regression, and the keep/revert/iterate decision.
A criterion's adversarial classes are the ultraqa classes a fact about the change triggers: malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions. Record untriggered classes as not-applicable in one line.
Use channel-table evidence verbs (tmux transcript, curl status+body, screenshot, action log, CLI stdout, DB diff, parsed config dump) — not vibes.

**Plan for maximum parallelism (HEAVY goals).** Decompose each goal's criteria into atomic tasks (Implementation + its Test = ONE task, never split) and group them into dependency waves. Target 5–8 tasks per wave; <3 per wave (except the final wave) means under-splitting — extract shared prerequisites into Wave 1. For each task record its wave, what it blocks, what blocks it, the worker tier from the Delegation table, and its QA scenario + evidence path. Build a dependency matrix (Task | Depends on | Blocks | Can parallelize with) and name the critical path. Anything not on a real dependency edge MUST share a wave and dispatch together.
Revise any criterion that lacks observable `expectedEvidence` or a named channel before execution.

### 3. Inspect state
Run `omo-grok-ulw-loop status --goal-runtime grok --json`.
Read pending goals, criteria IDs, current ledger head, blockers, and the aggregate Grok objective from `goal/plan.md` (or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>`).

## Execution Loop
Loop per goal. Cap at 5 cycles per goal. Cap identical same-criterion failures at 3.

### Acquire Next Goal
1. Run `omo-grok-ulw-loop complete-goals --goal-runtime grok --json` and read the handoff, including criteria.
2. Read Grok goal state from `goal/plan.md` or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>`.
3. Apply this table exactly:

| Grok goal state | action |
|-----------------|--------|
| no active objective in plan.md | You cannot invoke `/goal` (it is a user-run slash command). Print the exact `/goal <objective>` line — handoff objective text only, no lifecycle fields such as `status` — for the user to run, then continue executing this story without waiting. |
| same aggregate objective active | Continue the current ulw-loop story. |
| different objective active | STOP. Checkpoint blocked and surface the conflict. |
4. If retrying failed work, run `omo-grok-ulw-loop complete-goals --goal-runtime grok --retry-failed --json`.
5. Never surface a second `/goal` for the same aggregate objective while the first is still active.

### Per-Criterion Cycle
1. PLAN: read `criterion.scenario`, `criterion.expectedEvidence`, prior ledger entries, and safety bounds. Identify which tasks in the current wave are independent.
2. Track atomic todos locally and via `update_goal({message: "..."})` progress updates — one ultra-granular step per action. Mark each step started and finished in your updates; exactly one active step at a time; never let the rendered plan lag behind reality.
3. DELEGATE-IN-PARALLEL: dispatch every independent task in the wave at once via right-sized `Task` subagents (Delegation table). Each worker captures evidence failing-first: when the task touches EXISTING behavior, PIN it FIRST — a characterization test that asserts the current observable behavior and PASSES on the unchanged code, as rigorous as the new-behavior scenario (exact inputs, exact observable, exact assertion). Then RED through the cheapest faithful channel — a unit test where a seam exists, an integration/e2e test where the behavior lives in wiring, or the criterion's scenario captured failing when no test seam exists — failing for the RIGHT reason (no syntax/import error). A test that mirrors its implementation (mock-call assertions, pinned constants, cannot fail under plausible regression) is not evidence; use the scenario as the failing proof instead. Then the SMALLEST GREEN change; before GREEN work that depends on external review, PR, issue, or branch state, refresh current branch/PR/issue state, preserve existing ordering/policy, and separate compatibility detection from policy changes unless the goal explicitly asks to change policy. A GREEN far larger than the criterion implies means the proof was too coarse — instruct a split. Serialize only on a NAMED dependency.
4. INTEGRATE + CRITICAL SELF-QA + GIT CHECKPOINT (EVERY WORKER RETURN): do NOT trust the worker's report. Read the diff yourself, re-run its tests, and run LSP diagnostics on the changed files. Treat "done" as a claim to disprove. If the diff drifts, the test is hollow, or evidence is missing, RESPAWN the worker with the specific failure context. Once the work unit is verified, use `git-master` before staging: inspect recent repository commits and touched-path history to infer commit language, Conventional Commit scope, message shape, and unit size. Stage only that unit's files and commit in the observed style; do not carry verified work forward into a later omnibus commit. If no git-tracked files changed or committing is unsafe, record the no-commit reason as evidence. Forward every finding/learning to subsequent workers.
5. EXECUTE-AS-SCENARIO: ACTUALLY run the Manual-QA scenario the criterion named (channel table above). Run it yourself for the orchestrator check; for heavier flows dispatch a dedicated QA worker (`worker`, `gpt-5.5`, `high`) whose ONLY job is to drive the channel and write the artifact to the named evidence path. If the scenario FAILS, respawn the implementing worker with the captured failure — do not hand-patch around it.
6. CAPTURE: collect the observable artifact path: transcript, stdout, screenshot, assertion, status+body, diff, or parsed dump. No artifact written at the evidence path — not done; record BLOCKED and respawn QA.
7. CLEAN (PAIRED, NEVER SKIP): tear down every runtime artifact step 5 spawned BEFORE recording — server PIDs (`kill`, verify `kill -0` fails), `tmux` sessions (`tmux kill-session -t ulw-qa-<criterion>`; confirm `tmux ls`), browser / Playwright contexts (`.close()`), containers (`docker rm -f`), bound ports (`lsof -i :<port>` empty), temp sockets / files / dirs (`rm -rf` the `mktemp` paths), QA-only env vars, and confirm every finished Task subagent has returned. Register each teardown as its own todo the moment the QA spawns the resource (scripts, tmux assets, browsers / agent-browser sessions, PIDs, ports) so none is forgotten. Embed a one-line cleanup receipt in the evidence string, e.g. `cleanup: killed 12345; tmux kill-session ulw-qa-foo; rm -rf /tmp/ulw.aB12cD; task w-3 returned`. Missing receipt → record BLOCKED, not PASS.
8. RECORD exactly one result:
   - PASS: `omo-grok-ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status pass --evidence "<observable> | <cleanup receipt>" --json`
   - FAIL: `omo-grok-ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status fail --evidence "<observable> | <cleanup receipt>" --notes "<diagnosis>" --json`
   - BLOCKED: `omo-grok-ulw-loop record-evidence --goal-id <id> --criterion-id <id> --status blocked --evidence "<observable>" --notes "<safety/blocker/leftover-state>" --json`
9. If actual does not match expected, diagnose, respawn the right-sized worker with the failure context to fix minimally, and rerun the SAME criterion (including a fresh cleanup).
10. After 3 same-criterion failures, exit the goal with diagnosis.
11. After 5 cycles on one goal without required criteria passing, checkpoint failed.
12. Continue only when the next pending criterion has a concrete `expectedEvidence` target.

### Goal Completion
1. Non-final aggregate goal: confirm every `essential` criterion is `pass`; non-essential criteria may remain pending. Final aggregate goal: confirm every criterion across the whole plan is `pass`.
2. Read a fresh Grok goal snapshot from `goal/plan.md` or `omo-grok-ulw-loop grok-goal-snapshot read --session-id <id>`.
3. Run `omo-grok-ulw-loop checkpoint --goal-runtime grok --goal-id <id> --status complete --evidence "<criteria evidence summary>" --grok-goal-json <snapshot> --json`.
4. If blocked or failed, checkpoint with `--status blocked` or `--status failed` and include diagnosis evidence.
5. If this is the final goal, run the final quality gate first and pass `--quality-gate-json`.

## Final Quality Gate
Trigger only for the final aggregate goal after every criterion in every goal is `pass`.
1. Run targeted verification for changed behavior.
2. Run Manual-QA for every criterion; confirm each artifact exists and is non-empty.
3. Spawn final reviewers with `fork_context: false`: code review, QA review, gate review. Include original brief, goals, desired outcome, and diff.
4. Treat timeout, missing deliverable, ack-only, `BLOCKED:`, or inconclusive review as a blocker. Fix, rerun affected verification/Manual-QA, and repeat review.
5. If review remains blocked, run `omo-grok-ulw-loop record-review-blockers --goal-runtime grok --goal-id <id> --title "<...>" --objective "<...>" --evidence "<review findings>" --grok-goal-json <snapshot> --json`.
6. If clean, checkpoint final completion:
```sh
omo-grok-ulw-loop checkpoint --goal-runtime grok --goal-id <id> --status complete --evidence "<e2e evidence + manual QA notes>" --grok-goal-json <snapshot> --quality-gate-json <json-or-path> --json
```
Then signal Grok completion with `update_goal({completed: true, message: "..."})` only after this checkpoint succeeds.
`--quality-gate-json` shape:
```json
{
  "codeReview":{"by":"code-reviewer","recommendation":"APPROVE","codeQualityStatus":"CLEAR","reportPath":"components/ulw-loop/test/fixtures/artifacts/code-review.md","evidence":"Diff review passed.","blockers":[]},
  "manualQa":{"by":"qa-executor","status":"passed","evidence":"CLI and data surfaces passed.","surfaceEvidence":[{"id":"surface-cli-pass","criterionRef":"C1","surface":"cli","invocation":"omo-grok-ulw-loop checkpoint --goal-runtime grok --quality-gate-json sample-quality-gate.json --json","verdict":"passed","artifactRefs":["artifact-cli-pass"]},{"id":"surface-data-pass","criterionRef":"C2","surface":"data","invocation":"diff -u before-ledger.json after-ledger.json","verdict":"passed","artifactRefs":["artifact-data-diff"]}],"adversarialCases":[{"id":"adv-malformed-input","criterionRef":"C3","scenario":"malformed gate input omits manual QA evidence","expectedBehavior":"validator rejects ULW_LOOP_QUALITY_GATE_INVALID","verdict":"passed","artifactRefs":["artifact-cli-reject"]}],"artifactRefs":[{"id":"artifact-cli-pass","kind":"cli-transcript","description":"CLI pass artifact.","path":"components/ulw-loop/test/fixtures/artifacts/cli-pass.txt"},{"id":"artifact-cli-reject","kind":"log","description":"Reject log artifact.","path":"components/ulw-loop/test/fixtures/artifacts/rejection.txt"},{"id":"artifact-data-diff","kind":"data-diff","description":"Data diff artifact.","path":"components/ulw-loop/test/fixtures/artifacts/data-diff.txt"}]},
  "gateReview":{"by":"gate-reviewer","recommendation":"APPROVE","reportPath":"components/ulw-loop/test/fixtures/artifacts/gate-review.md","evidence":"Gate review passed.","blockers":[]},
  "iteration":{"fullRerun":true,"status":"passed","rerunCommands":["npm test"],"evidence":"Focused rerun passed."},
  "criteriaCoverage":{"totalCriteria":3,"passCount":3,"originalIntent":"User wanted artifact-backed completion.","desiredOutcome":"Behavior ships with review and QA evidence.","userOutcomeReview":"Result matches brief and goals.","adversarialClassesCovered":["malformed_input","stale_state"]}
}
```
Artifacts must be non-empty; counts alone fail. LIGHT without adversarial class records `"adversarialClassesCovered": ["none-applicable: <reason>"]`.

## Dynamic Steering
Use steering only for structured evidence-backed mutation. Reject natural-language steering requests.

| Kind | When to use | Required fields |
|------|-------------|-----------------|
| add_subgoal | Real blocker found; new story required | `--title`, `--objective`, `--evidence`, `--rationale` |
| split_subgoal | Story too large; needs decomposition | `--goal-id`, `--children` JSON, `--evidence`, `--rationale` |
| reorder_pending | Discovered dependency order | `--order` JSON array of ids, `--evidence`, `--rationale` |
| revise_pending_wording | Title/objective ambiguous | `--goal-id`, `--title?`, `--objective?`, `--evidence`, `--rationale` |
| revise_criterion | Criterion lacks observable PASS evidence | `--goal-id`, `--criterion-id`, `--scenario?`, `--expected-evidence?`, `--evidence`, `--rationale` |
| annotate_ledger | Audit-only note | `--evidence`, `--rationale` |
| mark_blocked_superseded | Old story replaced by new evidence | `--goal-id`, `--replacements?`, `--evidence`, `--rationale` |

Command form: `omo-grok-ulw-loop steer --kind <kind> [<kind-specific-fields>] --evidence "<...>" --rationale "<...>" --json`.
Structured prompt directives accepted: `OMO_ULW_LOOP_STEER: { ... }`, `omo.ulw-loop.steer: {...}`, `omo-grok-ulw-loop steer: {...}`.

## Constraints
1. NEVER call `update_goal({completed:true})` mid-aggregate; only on final story after the quality gate passes.
2. NEVER surface a conflicting `/goal` when goal/plan.md already tracks a different active objective.
3. NEVER mark `criterion.status == "pass"` without captured observable evidence in `record-evidence`.
4. NEVER bypass the criteria gate: non-final aggregate completion requires all essential criteria; final aggregate completion requires all criteria across the whole plan.
5. Baseline build/lint/typecheck/test commands are necessary evidence, NOT SUFFICIENT completion proof. Criteria coverage with observable evidence is the gate.
6. Treat `.omo/ulw-loop/ledger.jsonl` as the durable audit trail; checkpoint after every success or failure.
7. Per-story goal mode is opt-in only with `--goal-mode per-story`; default is aggregate with `--goal-runtime grok`.
8. Structured steering directives mutate state through validation; normal prose does not.
9. Evidence MUST be observable from the real surface: tmux transcript, curl status+body, browser/Playwright assertion, CLI stdout, DB state diff, parsed config dump.
10. Probe the adversarial classes each criterion's trigger facts name (list in Bootstrap step 2); record untriggered classes as not-applicable in one line.
11. After completing an aggregate ulw-loop run, ask the user to run `/goal clear` before starting another in the same session.
12. The shell command emits a model-facing handoff; align Grok goal state via a `/goal <objective>` line surfaced to the user, `update_goal`, and `goal/plan.md` — not Codex `get_goal` / `create_goal`.
13. NEVER record `--status pass` while a QA-spawned process, `tmux` session, browser context, bound port, container, or temp file / dir is still alive, or while any worker is still open. The evidence string MUST include the cleanup receipt. Leftover runtime state = BLOCKED, not PASS.
14. DELEGATE all code edits, test writes, fixes, and QA execution to right-sized Task subagents (Delegation table); you read, search, plan, integrate, and QA. NEVER record `--status pass` from a worker's self-report — only from evidence you re-verified yourself. Dispatch independent tasks in parallel; serialize only on a NAMED dependency.
15. Every verified work unit that touched git-tracked files must leave either an atomic `git-master`-style commit hash or explicit no-commit blocker evidence before the next unit starts.

## Stop Rules
- All goals complete plus every plan criterion `pass` plus final quality gate clean: DONE.
- 3x same criterion failure: checkpoint failed, surface diagnosis.
- 5 cycles on one goal without required criteria passing: checkpoint failed, surface.
- Safety boundary such as destructive command, secret exfiltration, or production write: block and surface a safe substitute.
- Grok `goal/plan.md` objective conflicts with the active ulw-loop story: checkpoint blocker, stop, surface.
- Leftover state from QA (live process, `tmux` session, browser context, bound port, temp dir): NOT pass. Clean up, append the receipt, then continue.
- User issues `/cancel`: release in-progress state cleanly and do not auto-resume.
