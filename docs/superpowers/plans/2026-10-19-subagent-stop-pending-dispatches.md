# SubagentStop Pending-Dispatch Exemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the SubagentStop contract check from grading a subagent's yield as its final reply while that subagent's own in-turn async `Agent` dispatches are still pending.

**Architecture:** `plugin/bin/lib/hooks/subagent-stop.js` already scans the subagent transcript (`lastAssistantText`). Add one pure function, `countPendingDispatches(lines, replyIndex)`, that collects async launch acks and task-notification completions before the graded reply, correlates them by id, and returns the pending count (or `null` when the transcript shape can't be trusted). `run()` skips grading when the count is above zero, placed beside the existing #2041/#2714 exemptions. A 60-minute age bound keeps a hung child from exempting forever.

**Tech Stack:** Node 18+ CommonJS, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T093934-record-3015/work/3015-spec.md`

Scope keywords: countPendingDispatches, isAsyncWaitSignal, INTERIM_STATUS

## Global Constraints

- A reply with nothing pending is graded exactly as today, including the existing #2041 (`asyncWaitCheckpoint`) and #2714 (`INTERIM_STATUS:`) exemptions.
- Transcript parsing stays defensive: an unparseable or unexpected shape falls back to today's grading, never to a blanket exemption.
- Correlate by id (agentId / tool_use_id), not by count.
- The exemption is bounded so a hung child cannot hide a real contract violation.
- Fixtures use real transcript line shapes, not invented ones.
- Commit messages: `{Verb} {what} — {detail}`, reference the record as `refs #3015` (never `closes`/`fixes`).

## Verified transcript shapes (Gotcha 1 — probed at authoring time)

Read from live transcripts on this machine (`…/-Users-thomasholknielsen-Code-Workspaces-dispatch/d5d616b3-…/subagents/agent-a39fe70648c970fc6.jsonl` — a subagent transcript — and `…/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks--claude-worktrees-flow-spec-3573/f1c2577c-….jsonl`):

- **Async launch ack** (one `type: 'user'` line): `toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'a8f3ba2495443dea5', description, resolvedModel, prompt, outputFile, canReadOutputFile, canContinueAgent }`, `message.content[0]` = `{ tool_use_id: 'toolu_016xwSa23pdEq8WP2bRyYjCU', type: 'tool_result', content: [{ type: 'text', text: 'Async agent launched successfully. …agentId: a8f3ba2495443dea5 …' }] }`, plus a top-level ISO `timestamp`.
- **Completion** (one `type: 'user'` line): `origin: { kind: 'task-notification', producer: 'session-task', runId }`, `message.content` is a **string**: `<task-notification>\n<task-id>a8f3ba2495443dea5</task-id>\n<tool-use-id>toolu_016xwSa23pdEq8WP2bRyYjCU</tool-use-id>\n<output-file>…</output-file>\n<status>completed</status>\n<summary>Agent "…" finished</summary>…`, plus `timestamp`.
- Observed `<status>` values across all local transcripts: `completed` (7845), `failed` (105), `killed` (7), `stopped` (2) — all terminal, so any notification naming an id counts as that id's completion.
- Background `Bash` runs use `toolUseResult.backgroundTaskId`, never `isAsync`, so they are not counted as launches; their notifications carry a `<task-id>` that matches no launch and is ignored.
- The subagent transcript above shows the target yield shape: line 25 launch, line 26 text-only "I'll wait for the code-simplifier subagent…", line 27 notification.

## Review Focus

1. A child launched long ago that never reports (hung) — a final non-compliant reply must still be graded once the launch is older than the bound (Task 1 test `bound: a launch older than 60 minutes no longer exempts`).
2. A task-notification whose content carries no recognizable id (unknown future shape) — must fall back to grading, not exempt (Task 1 unit test).
3. Background-Bash notifications interleaved with agent launches — must not complete an unrelated agent launch (Task 1 unit test).
4. Missing/unparseable timestamps on the reply or a pending launch — fall back to grading (Task 1 unit test).
5. A notification correlated only by `<tool-use-id>` (agentId text differs) — still completes the launch (Task 1 unit test).

---

### Task 1: Pending-dispatch count and exemption in subagent-stop.js

**Files:**
- Modify: `plugin/bin/lib/hooks/subagent-stop.js` (header comment false-positive list after source 5 ~line 105; new function after `isAsyncWaitSignal` ~line 266; `lastAssistantText` ~lines 273-321; `run()` after the `isInterimProgressReply` skip ~line 389; `module.exports` line 426)
- Test: `tests/hooks-subagent-stop.test.js` (append; the spec's Key Files names `tests/bin-lib/hooks/contract-retries.test.js`, but that file only covers the retry counter — SubagentStop grading lives here and in `tests/hooks-log-modules.test.js`)

**Interfaces:**
- Produces: `countPendingDispatches(lines: string[], replyIndex: number) -> number | null` exported from `subagent-stop.js`. `lines` is the raw transcript split on `\n`; `replyIndex` is the index of the graded assistant reply line. Returns the count of pending launches, or `null` when indeterminate (treated exactly like 0 by `run()`).
- Produces: constant `PENDING_DISPATCH_MAX_AGE_MS = 60 * 60 * 1000` (exported, for tests).
- `lastAssistantText(transcriptPath)` return widens to `{ text, asyncWaitCheckpoint, pendingDispatches }` (not exported; every early return gets `pendingDispatches: 0`). Return-shape-widening grep: `git grep -n "lastAssistantText" -- tests plugin` → only `subagent-stop.js` itself, so no assertion is defanged.

Algorithm `countPendingDispatches` (decides what the signature does not):
1. Reply timestamp = `Date.parse(JSON.parse(lines[replyIndex]).timestamp)`.
2. Walk `lines[0 .. replyIndex-1]`: skip blank lines; a non-blank line that fails `JSON.parse` → return `null`.
3. Launch = `entry.toolUseResult && entry.toolUseResult.isAsync === true`. Record `agentId` (non-empty string or null), `toolUseId` = `entry.message.content[0].tool_use_id` when `content` is an array (non-empty string or null), `ts = Date.parse(entry.timestamp)`. Both ids null → return `null`.
4. Completion = `entry.origin && entry.origin.kind === 'task-notification'`. `message.content` must be a string, else return `null`. Collect every `<task-id>X</task-id>` and `<tool-use-id>X</tool-use-id>` value (global match) into one `completed` set; zero ids found → return `null`.
5. A launch is pending when neither its `agentId` nor its `toolUseId` is in `completed`. For each pending launch: if the reply ts or launch ts is NaN → return `null`; if `replyTs - launchTs > PENDING_DISPATCH_MAX_AGE_MS` → not counted (presumed hung). Return the counted total.

60 minutes mirrors `flow/claim-targets.md`'s existing 60-minute liveness judgment default for a holder's transcript.

- [ ] **Step 1: Write the failing tests**

Append to `tests/hooks-subagent-stop.test.js`. Fixture builders mirror the verified shapes above (comment citing the source transcript paths, for AC4.1):

```js
// #3015 fixtures — line shapes copied from live transcripts (subagents/agent-a39fe70648c970fc6.jsonl,
// flow-spec-3573 main transcript): launch ack = toolUseResult.isAsync + agentId + tool_use_id;
// completion = origin.kind 'task-notification' with a string <task-notification> body.
const T0 = Date.parse('2026-10-19T09:00:00.000Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
function agentCall(id, min) { /* assistant line: content [{ type:'tool_use', id, name:'Agent', input:{ description:'Lens '+id } }], timestamp at(min) */ }
function launchAck(agentId, toolUseId, min) { /* user line: message.content [{ tool_use_id, type:'tool_result', content:[{type:'text', text:'Async agent launched successfully. …\nagentId: '+agentId+' …'}] }], toolUseResult { isAsync:true, status:'async_launched', agentId, description, canContinueAgent:true }, timestamp */ }
function notification(agentId, toolUseId, min, status = 'completed') { /* user line: message.content string '<task-notification>\n<task-id>'+agentId+'</task-id>\n<tool-use-id>'+toolUseId+'</tool-use-id>\n<output-file>/tmp/x/tasks/'+agentId+'.output</output-file>\n<status>'+status+'</status>\n<summary>Agent "Lens" finished</summary>\n</task-notification>', origin { kind:'task-notification', producer:'session-task', runId:'r1' }, timestamp */ }
function readCall(min) { /* assistant tool_use Read + following user tool_result 'ok' — the intervening tool call that defeats #2041 */ }
function reply(text, min) { /* assistant line with one text block, timestamp */ }
function writeTranscript(entries) { /* JSON.stringify each, join '\n', write to mkdtemp agent.jsonl, return path */ }
function runOn(transcriptPath, extraInput = {}) { /* mkRun(); substop.run({ input:{ agent_transcript_path, ...extraInput }, runDir, runState:null, ownedRun:{dir:run, attribution:'session'}, cwd:'/x' }); return { out, events } like callSubstop */ }
```

Tests (names carry the AC clause ids):

- `AC1.1: a yield after intervening tool calls while 2 of 3 launched Agent dispatches are pending is not blocked and logs nothing` — entries: 3× (`agentCall`, `launchAck`) at min 0-1, `notification('a1',…)` at 3, `readCall(4)`, `reply('Lens 1 back; waiting on lenses 2 and 3.', 5)`; call with `session_id: 'cr-3015-ac1-'+process.pid, agent_id: 'parent-1'`. Assert `out` deepEquals `{}`, `events.length === 0`, and `contractRetries.readRetried(sessionId).has('parent-1') === false` (no forced STATUS retry). Cleanup the retries file.
- `AC2.1: the same transcript with every launched dispatch completed, ending in a non-compliant reply, is still blocked` — same entries plus notifications for a2, a3 before `readCall`; reply `'All lenses back; folded the findings in.'`. Assert `out.json.decision === 'block'`.
- `AC3.1: INTERIM_STATUS and immediately-after-async-signal replies behave as today with nothing pending` — (a) all-completed transcript whose reply ends `'\nINTERIM_STATUS: drafting the summary'` → `{}` and no events; (b) one launch then the reply immediately after `launchAck` (no notification) → `{}` and no events; (c) all-completed, reply ends `'\nSTATUS: DONE'` → `{}` and no events.
- `AC4.1: fixture line shapes match the live-transcript shapes` — assert `substop.isAsyncWaitSignal(JSON.parse(launchAck…))` and `isAsyncWaitSignal(JSON.parse(notification…))` are both `true` (the fixtures are recognized by the existing, live-verified #2041 predicate), and `countPendingDispatches` on `[agentCall, launchAck, notification, reply]` returns `0`.
- `bound: a launch older than 60 minutes with no completion no longer exempts a non-compliant reply` — one launch at min 0, `readCall(61)`, `reply('Done with everything.', 62)`, with session/agent ids → `out.json.decision === 'block'`. Also `countPendingDispatches` for the same lines with the reply at min 59 returns `1`.
- `countPendingDispatches: correlates a completion by tool-use-id alone` — notification whose task-id is `'other'` but tool-use-id matches the launch → `0`.
- `countPendingDispatches: a background-Bash notification does not complete an unrelated agent launch` — launch a1 + `notification('bash9', 'toolu_bash9', …)` → `1`.
- `countPendingDispatches: returns null for an id-less task-notification, a launch with no ids, an unparseable prior line, and a missing timestamp` — four sub-assertions, each `=== null`; plus a `run()` check that the id-less-notification transcript with a non-compliant reply after `readCall` is blocked (fallback to grading).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/hooks-subagent-stop.test.js`
Expected: FAIL — `AC1.1` fails (`out.json.decision === 'block'` today) and the `countPendingDispatches` tests fail with `substop.countPendingDispatches is not a function`.

- [ ] **Step 3: Implement `countPendingDispatches(lines, replyIndex) -> number | null` and wire it in `plugin/bin/lib/hooks/subagent-stop.js`**

Implement per the Algorithm above. In `lastAssistantText`, when a reply text is found, add `pendingDispatches: countPendingDispatches(lines, i)` to the returned object (all other returns carry `pendingDispatches: 0`). In `run()`, destructure it and add, immediately after the `isInterimProgressReply` skip and before the `toolUseCount === 0` check:

```js
  // #3015: a yield while this agent's own in-turn async Agent dispatches are
  // still pending is not its final reply. Bounded (PENDING_DISPATCH_MAX_AGE_MS);
  // null (indeterminate transcript shape) grades as today.
  if (pendingDispatches > 0) return {};
```

Add false-positive source 6 to the header comment (after source 5): `(fixed, #3015)` — #2041 needs the signal immediately before the reply and #2714 needs the dispatch prompt to request the marker; neither knows whether dispatches are outstanding. Name the live-verified shapes, the id correlation, the null-means-grade rule, and the 60-minute bound. Export `countPendingDispatches` and `PENDING_DISPATCH_MAX_AGE_MS`.

- [ ] **Step 4: Run tests to verify they pass, plus the existing hook suites (AC4.2)**

Run: `node --test tests/hooks-subagent-stop.test.js tests/hooks-log-modules.test.js tests/bin-lib/hooks/contract-retries.test.js tests/hooks-dispatcher.test.js tests/friction-events-cli.test.js`
Expected: PASS, 0 failures (AC4.2: the hook's existing tests pass unchanged).

- [ ] **Step 5: Real-input probe with an independent count**

Write a scratch script (outside the repo) that loads `subagent-stop.js`, reads `/Users/thomasholknielsen/.claude-accounts/djoef-thn/projects/-Users-thomasholknielsen-Code-Workspaces-dispatch/d5d616b3-ffa6-45a6-acd6-097b23d9c92c/subagents/agent-a39fe70648c970fc6.jsonl`, and prints `countPendingDispatches(lines, 26)` and `countPendingDispatches(lines, 60)`.
Expected: `1` then `0`. Independent count: `grep -c '"isAsync":true'` and `grep -c '"kind":"task-notification"'` on the same file both print `1`. Record the printed values in the task report.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/subagent-stop.js tests/hooks-subagent-stop.test.js
git commit -m "Exempt SubagentStop grading while in-turn Agent dispatches are pending — refs #3015"
```

### Task 2: Document the exemption

**Files:**
- Modify: `plugin/skills/_shared/subagent-output-contract.md:81` (the #2714 `INTERIM_STATUS:` paragraph)
- Modify: `docs/hooks.md:9` (the SubagentStop E3 tier-change bullet)
- Review (consumer check, expected no change): `plugin/skills/dispatch/task-prompt.md`, `plugin/skills/flow/multispec-parallel-waves.md`, `plugin/skills/reflect/full-mode.md`, `docs/journeys/read-where-a-pipeline-run-spent-its-minutes-1928.md`, `tests/hooks-log-modules.test.js` — added by plan-audit Check B (`scope-creep: add-to-plan`); they carry the `INTERIM_STATUS:` instruction or the #2041 tests, both of which stay valid because the marker remains required and nothing-pending grading is unchanged.

**Interfaces:**
- Consumes: Task 1's behavior (`countPendingDispatches`, 60-minute bound, null-means-grade).

- [ ] **Step 1: Edit `subagent-output-contract.md`**

Append to the end of the line-81 paragraph (same paragraph, no new heading): one or two sentences stating that `subagent-stop.js` also skips grading mechanically while the agent's own in-turn async `Agent` dispatches are still pending in its transcript (launch acks without a matching task-notification, correlated by id, bounded at 60 minutes) (#3015), so an unmarked yield mid-fan-out is no longer forced to emit `STATUS:`; the `INTERIM_STATUS:` marker stays required, because the count covers only the dispatcher's own pending children and an unparseable transcript falls back to grading. Keep the file well under the 51,200-byte ceiling (currently 29,016 bytes).

- [ ] **Step 2: Edit `docs/hooks.md`**

Add one bullet directly after line 9's E3 bullet: `**SubagentStop pending-dispatch exemption (#3015):**` — a reply is not graded while the subagent's own async `Agent` launches (`toolUseResult.isAsync`) lack a matching `task-notification` (by agentId or tool-use-id) before it; launches older than 60 minutes no longer count; any unrecognized shape returns to normal grading. Silent like the #2041/#2714 exemptions (no event).

- [ ] **Step 2b: Consumer check**

Read each Review file's `INTERIM_STATUS` mention (`git grep -n INTERIM_STATUS -- plugin docs/journeys`) and confirm none claims the marker is the *only* exemption for a pending fan-out yield in a way the new paragraph contradicts. Expected: no edits; if one does contradict, add a one-clause cross-reference to the contract paragraph rather than restating the mechanism.

- [ ] **Step 3: Run the prose conformance suites that read these files**

Run: `node --test tests/subagent-contract-clauses.test.js tests/subagent-status-line-prose-conformance.test.js tests/hooks-log-modules.test.js tests/hard-gate-marker-conformance.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/subagent-output-contract.md docs/hooks.md
git commit -m "Document the SubagentStop pending-dispatch exemption — refs #3015"
```
