# Deferred-Unstaged Ledger Rows (#3327) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `parseLedger` and wrap-up's bulk-resolve fast path flag any `deferred` ledger row whose Resolution names neither a staged-proposal path (`staged/…`) nor a record reference (`#N`). Route flagged rows to the resolve gate's Phase 2 instead of bulk-resolving them.

**Architecture:** `parseLedger` (`plugin/bin/lib/wrap-up/pack.js`) gains two additive fields, `deferredUnstaged` (a count) and `deferredUnstagedItems` (the rows' `#` cells). `ledgerProbe` sums both across ledger files. Prose follows: `wrap-up/nothing-left-behind.md`'s fast path stops treating a ledger with flagged rows as fully resolved and sends those rows to Phase 2. `_shared/ledger-format.md`'s Resolution-text requirement for `deferred` names the staged path or record reference, so legitimate Phase 3 deferrals always pass the new check.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill files.

**Spec:** `.claude-tweaks/pipelines/2026-10-18T203911-record-3327/work/3327-spec.md` (materialized from GitHub issue #3327)

## Global Constraints

- Additive only. Existing `parseLedger`/`ledgerProbe` fields (`open`, `total`, `byPhase`, `files`, `unrecognized`, `unrecognizedValues`) keep their names and meaning. `byPhase` entries are NOT widened.
- A flagged `deferred` row is never counted as `open` or `unrecognized`. It stays a recognized terminal status for those counts. Only the fast path's "fully resolved" judgment changes.
- Commit messages: `{Verb} {what} — {detail}`, and reference the record as `refs #3327` (never `closes`/`fixes`).
- Release note (from spec): "Wrap-up no longer lets a "deferred" ledger item close without a staged follow-up."

## Review Focus

1. A Resolution that wraps the path in backticks (`` `staged/ledger-record-x.md` ``) must still count as staged. Pinned in Task 1 (the AC2.1 test uses a backticked path).
2. A `#N` that appears only in the Item column, not in Resolution, must NOT make the row terminal. The rule reads the Resolution cell only. Pinned in Task 1.
3. An empty or `—` Resolution on a `deferred` row is flagged. Pinned in Task 1 (the AC1.1 fixture uses `—` on a second row).
4. A capitalised `Deferred` status is treated like `deferred` (status is already lower-cased). Pinned in Task 1.
5. A cross-repo reference (`owner/repo#123`) counts as a record reference, because `/#\d+/` matches it. Pinned in Task 1.

---

### Task 1: Flag deferred rows with no staged proposal or record reference in `parseLedger`

**Files:**
- Modify: `plugin/bin/lib/wrap-up/pack.js:352-379` (`parseLedger`) and `:429-448` (`ledgerProbe` totals)
- Test: `tests/bin-lib/wrap-up/pack.test.js`

**Interfaces:**
- Produces: `parseLedger(text)` and the `ledger` probe value both gain `deferredUnstaged: number` and `deferredUnstagedItems: string[]`. Each `deferredUnstagedItems` entry is the trimmed `#` cell of a flagged row, in file order (concatenated across files in `ledgerProbe`).

- [ ] **Step 1: Write the failing tests.** Add them next to the existing #2080 ledger tests, with the same fixture shape (`fixtureRunDir()` plus a `docs/plans/2026-09-05-spec-1535-ledger.md` in a temp tree, `gatherPack({ runDir, cwd: tree, only: ['ledger'], deps: okDeps() })`).

```js
test('AC1.1: a deferred row with no staged/ path and no #N reference is reported as deferredUnstaged (#3327)', async () => {
  // rows: 1 open; 2 deferred "Origin: SDD Task 1 review; files: a.md. Trigger: next edit" (no staged/, no #N);
  //       3 deferred "—"; 4 Deferred (capitalised) "triage: leave" with Item text "see #77" (Item-only #N)
  assert.strictEqual(pack.ledger.value.deferredUnstaged, 3);
  assert.deepStrictEqual(pack.ledger.value.deferredUnstagedItems, ['2', '3', '4']);
  assert.strictEqual(pack.ledger.value.open, 1);          // flagged rows never become open
  assert.strictEqual(pack.ledger.value.unrecognized, 0);  // …nor unrecognized
});

test('AC2.1: a deferred row naming staged/… or #N stays terminal (#3327)', async () => {
  // rows: 1 deferred "parked → `staged/ledger-record-foo.md`"; 2 deferred "→ backlog #123";
  //       3 deferred "reversed → thn-inc/claude-tweaks#456"
  assert.strictEqual(pack.ledger.value.deferredUnstaged, 0);
  assert.deepStrictEqual(pack.ledger.value.deferredUnstagedItems, []);
});
```

Also update the existing exact-shape assertion (around line 625, `assert.deepStrictEqual(pack.ledger.value, {…})`) to add `deferredUnstaged: 0, deferredUnstagedItems: []`. That is the only exact-shape assertion on the ledger value (checked with `git grep -n "ledger.value, {" -- tests`).

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/bin-lib/wrap-up/pack.test.js`
Expected: FAIL. The two new tests fail with `undefined !== 3` / `undefined !== 0`. The updated exact-shape test fails because the key is missing.

- [ ] **Step 3: Implement.** In `parseLedger`, for a row whose lower-cased status is `deferred`, read the Resolution as `cells.slice(4).join('|')` (so a `|` inside the text is not truncated). Flag the row when it matches neither `/\bstaged\//` nor `/#\d+/`, and push `cells[0]` onto the items list. Declare both regexes as module constants next to `LEDGER_TERMINAL_STATUSES`, with a one-line comment citing #3327 and `_shared/ledger-format.md`'s `deferred` definition. In `ledgerProbe`, initialise `deferredUnstaged: 0, deferredUnstagedItems: []` in `totals`, then sum and concatenate per file. The run-dir `ledger.md` branch already spreads `parseLedger`'s result, so it needs no change.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/bin-lib/wrap-up/pack.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Real-input probe (scratch, not committed).** Run the parser over a real ledger that has the incident shape: four SDD-carried `deferred` rows with triage-only Resolutions.

Run: `node -e "const {parseLedger}=require('./plugin/bin/lib/wrap-up/pack.js');const r=parseLedger(require('fs').readFileSync('docs/plans/2026-10-18-capture-argument-hint-producer-flags-ledger.md','utf8'));console.log(r.deferredUnstaged, JSON.stringify(r.deferredUnstagedItems))"`
Expected: `4 ["2","3","4","5"]`. Independent count: that file has exactly four `| deferred |` rows (2-5), and none of their Resolution cells contains `staged/` or `#` followed by a digit.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/wrap-up/pack.js tests/bin-lib/wrap-up/pack.test.js
git commit -m "Flag deferred ledger rows with no staged proposal in parseLedger — refs #3327"
```

### Task 2: Route flagged rows out of the fast path, and pin the deferred Resolution requirement

**Files:**
- Modify: `plugin/skills/wrap-up/nothing-left-behind.md:14-16` (the "Bulk-resolve fast path" section)
- Modify: `plugin/skills/_shared/ledger-format.md:59` (status-enum paragraph) and `:61` (Resolution-text requirements)

**Interfaces:**
- Consumes: Task 1's `pack.ledger.deferredUnstaged` / `deferredUnstagedItems`.

- [ ] **Step 1: Edit `nothing-left-behind.md`'s fast-path paragraph.** It already checks every `acknowledged` item for a staged proposal. Add a sibling check: a `deferred` item whose Resolution names neither a `staged/…` path nor a `#N` record reference counts as an incomplete deferral, not a resolved one. `pack.ledger.deferredUnstaged` / `deferredUnstagedItems` count these at pack time. If the residue sweep appended rows after the pack ran, re-check the ledger file with the same rule. When any are found, the ledger is **not** fully resolved, and the "All {N} ledger items resolved" report must not be emitted. Each such row goes through the resolve gate's Phase 2 per-item drill exactly as an `open` item would, autonomy-ceiling narrowing included. Phase 3 then records the outcome on that same row: `Defer`/`Keep` put the staged path into its Resolution (status stays `deferred`), and `Accept`/`Drop` set `accepted`. This is the same-run first complete terminal write that ledger-format's Write-back contract allows, not a reopen. Name the producer of this shape inline: `build/dispatch.md`'s SDD carry-forward writes `minor (deferred):` lines as `deferred` with only a triage reason (#3327).

- [ ] **Step 2: Edit `_shared/ledger-format.md`.** (a) In the Resolution-text requirements sentence, change `deferred` to "includes origin, affected files, the trigger for when to revisit, and the staged proposal path (`staged/…`) or, once created, the record reference (`#N`) that carries it". (b) In the status-enum paragraph, after the `unrecognized` sentence, add one sentence: `parseLedger` also counts a `deferred` row whose Resolution names neither as `deferredUnstaged` (#3327), and `wrap-up/nothing-left-behind.md`'s fast path routes those rows to Phase 2 rather than treating them as resolved.

- [ ] **Step 3: Verify no prose pin broke**

Run: `node --test tests/deferral-gate-conformance.test.js tests/staged-patch-contract.test.js tests/flow-ledger-creation-timing-conformance.test.js tests/deferred-live-verification-ac-class.test.js tests/build-sdd-ledger-residue-carryforward.test.js tests/bin-lib/wrap-up/ledger-write.test.js`
Expected: PASS. None of these pins the edited sentences, per `git grep -n -F "includes origin, affected files" -- tests` and `git grep -n -F "Bulk-resolve fast path" -- tests`, which both return no test hits. Byte headroom is ample: nothing-left-behind.md is 5,940 B and ledger-format.md is 31,441 B, against the 51,200 B ceiling.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/wrap-up/nothing-left-behind.md plugin/skills/_shared/ledger-format.md
git commit -m "Route deferred-unstaged ledger rows to Phase 2 in the wrap-up fast path — refs #3327"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 (parseLedger + fast path flag) is covered by Task 1 and Task 2 Step 1. Deliverable 2 (route to Phase 2 or stage instead of bulk-resolving) is covered by Task 2 Step 1. AC1 is split across two places: its pack-test half is Task 1's AC1.1 test, and "the fast path no longer treats that ledger as fully resolved" is Task 2 Step 1. AC2 (`staged/…` or `#N` stays terminal) is Task 1's AC2.1 test.
- **Producers (gate-over-producers):** the `deferred` producers are Phase 3 Defer/Keep, `ledgerNarrowing`, `ledgerRouteRemainder` (all "stage … update status to `deferred`"), the review-console reverse (`reversed → #{new record}`, already carries `#N`), and SDD carry-forward (triage-only, which is the incident). Task 2 Step 2(a) makes the stage-path requirement explicit for the first three. SDD carry-forward is deliberately caught by the gate, not changed.
- **Consumers:** `pack.ledger` is read only by `wrap-up/SKILL.md` (`total`, `unrecognized`). Neither field changes.
- **Placeholders:** none.
