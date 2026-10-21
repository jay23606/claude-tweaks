# Digest Dedup Trusted Fingerprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Materiality-digest dedup (and the `/tidy` digest sweep's reads of the same container) honor a `<!-- materiality-fingerprint: … -->` marker only when it sits in a comment whose author association GitHub attests as trusted.

**Architecture:** `isMaterialityDuplicate` changes its first argument's github-issues shape from an array of raw comment bodies to an array of comment objects and filters them through `comment-trust.js`'s existing `isTrustedComment` (no new allowlist). A new exported helper `trustedMaterialityTexts` returns the trusted texts plus one `untrustedSkipNote` line per skipped marker-carrying comment, so prose callers can name what was skipped per `_shared/pr-run-comments.md`'s Trusted authors section. The local-files shape (a single string — the tracked `specs/digest.md` body, single-writer) stays trusted. The two contract files are updated so every caller passes comment objects and the digest sweep reads only trusted comments.

**Tech Stack:** Node 18+ CommonJS, `node --test`, markdown skill contracts.

**Spec:** `.claude-tweaks/pipelines/2026-10-20T201915-record-3766/work/3766-spec.md`

**Premise-refs:** plugin/bin/lib/issues/comment-trust.js

## Global Constraints

- Reuse `comment-trust.js`'s trust predicate (`isTrustedComment`) and skip-note builder (`untrustedSkipNote`) — never a new allowlist. Trusted set is exactly `OWNER`/`MEMBER`/`COLLABORATOR`; `NONE`, `CONTRIBUTOR`, a missing association, and a bare-string array element are untrusted (fail closed).
- Both association spellings count: `authorAssociation` (gh) and `author_association` (REST/MCP).
- A top-level string argument (local-files container body) stays trusted — `specs/digest.md` is a tracked, single-writer file with no third-party commenters.
- `plugin/skills/**/*.md` Read-limit rail: `RAIL_BYTES` 52,500 B. Current sizes: `_shared/materiality-floor.md` 10,344 B, `tidy/digest-sweep.md` 5,265 B — both far below the rail (≥42 KB headroom each after this change).

## Reader inventory (Reader-inventory derivation check)

Derived from read call sites over the digest container's comments (`gh issue list --label digest` → `--json comments` / `issue_read get_comments`), not from the marker literal:

| Read site | Reads markers/entry lines? | Disposition |
|---|---|---|
| `_shared/materiality-floor.md` `### Dedup` (cited by `review/step3-routing.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `reflect/full-mode.md`, `reflect/hindsight-mode.md`, `visual-review/browser-review.md`, the four health sweeps — all route via this section, none reads the comments itself) | yes — fingerprint markers | Task 2: pass comment objects, trusted only |
| `_shared/materiality-floor.md` `## Container` race repair sentence ("merge the newer issue's comments into the older") | copies comment content into a comment the trusted sweep authors — would launder an untrusted marker | Task 2: merge trusted comments only |
| `tidy/digest-sweep.md` Bootstrap-race repair | same copy as above | Task 2: trusted comments only |
| `tidy/digest-sweep.md` Cluster promotion (entry lines across comments → ≥3 per `{area}` proposal) | yes — entry lines | Task 2: trusted comments only |
| `tidy/digest-sweep.md` Expiry (entry lines + provenance) | yes — entry lines | Task 2: same active set, trusted only |
| `tidy/digest-sweep.md` Container rollover (100-comment count) | no — counts comments, acts on no marker | unchanged |
| `_shared/health-filing-digest.md` cap digest | different container (issue-index body checklist, not comments) | out of scope |

## Review Focus

- A comment object with `author_association` (REST/MCP snake_case) and no camelCase field — must still be trusted when OWNER/MEMBER/COLLABORATOR (pinned in Task 1, AC2.1 test).
- An array mixing a bare string with comment objects — the bare string must be skipped, not trusted (pinned in Task 1).
- A trusted comment and an untrusted comment carrying the same fingerprint — still a duplicate (trusted wins; pinned in Task 1).
- An untrusted comment carrying no marker — must not produce a skip note (noise); pinned in Task 1.
- Lower-case `'owner'` association — untrusted (comment-trust's exact-match rule; covered by comment-trust's own tests, not re-pinned).

---

### Task 1: Trust-filter the dedup fingerprint sources

**Files:**
- Modify: `plugin/bin/lib/health-core/materiality-digest.js` (lines 10-12 header comment, lines 64-76 `isMaterialityDuplicate`, new `trustedMaterialityTexts`, exports)
- Test: `tests/bin-lib/health-core/materiality-digest.test.js`

**Interfaces:**
- Consumes: `isTrustedComment(comment) -> boolean`, `untrustedSkipNote(comment) -> string` from `plugin/bin/lib/issues/comment-trust.js` (require path `'../issues/comment-trust'`).
- Produces:
  - `trustedMaterialityTexts(existing: string | Array<object|string>) -> { texts: string[], skipped: string[] }` — a string → `{ texts: [string], skipped: [] }`; an array → `texts` = `.body` of each element passing `isTrustedComment`; `skipped` = `untrustedSkipNote(el)` for each element failing it whose body (`el.body`, or the element itself when it is a string) carries at least one materiality-fingerprint marker. `null`/`undefined` → `{ texts: [], skipped: [] }`.
  - `isMaterialityDuplicate(existing, entry) -> boolean` — same signature, now computed over `trustedMaterialityTexts(existing).texts`.

- [ ] **Step 1: Write the failing tests**

Convert the existing array-of-strings cases (`'isMaterialityDuplicate is true when an identical entry was already routed in a prior comment'`, `'... across multiple comments ...'`, `'... false for a genuinely new finding ...'`) to comment objects `{ body, authorAssociation: 'OWNER' }`, and add a helper `comment(body, association)` returning `{ body, authorAssociation: association }`. New tests:

```js
test('AC1.1: an untrusted-association comment carrying a matching fingerprint does not make the candidate a duplicate', () => {
  for (const association of ['NONE', 'CONTRIBUTOR', 'FIRST_TIME_CONTRIBUTOR']) {
    assert.strictEqual(isMaterialityDuplicate([comment(materialityEntryLine(ENTRY), association)], ENTRY), false, association);
  }
  assert.strictEqual(isMaterialityDuplicate([{ body: materialityEntryLine(ENTRY) }], ENTRY), false); // no association
  assert.strictEqual(isMaterialityDuplicate([materialityEntryLine(ENTRY)], ENTRY), false); // bare string element
});

test('AC2.1: a matching fingerprint in an OWNER/MEMBER/COLLABORATOR comment still dedups', () => {
  for (const association of ['OWNER', 'MEMBER', 'COLLABORATOR']) {
    assert.strictEqual(isMaterialityDuplicate([comment(materialityEntryLine(ENTRY), association)], ENTRY), true, association);
    assert.strictEqual(isMaterialityDuplicate([{ body: materialityEntryLine(ENTRY), author_association: association }], ENTRY), true, `${association} (REST)`);
  }
});

test('a trusted copy of the fingerprint still dedups when an untrusted copy sits beside it', () => {
  const line = materialityEntryLine(ENTRY);
  assert.strictEqual(isMaterialityDuplicate([comment(line, 'NONE'), comment(line, 'MEMBER')], ENTRY), true);
});

test('trustedMaterialityTexts names each skipped marker comment and ignores untrusted comments with no marker', () => {
  const planted = { body: materialityEntryLine(ENTRY), authorAssociation: 'NONE', url: 'https://example.test/c/1', author: { login: 'mallory' } };
  const chatter = { body: 'just a comment', authorAssociation: 'NONE', url: 'https://example.test/c/2', author: { login: 'bob' } };
  const owner = comment('owner text', 'OWNER');
  const { texts, skipped } = trustedMaterialityTexts([planted, chatter, owner]);
  assert.deepStrictEqual(texts, ['owner text']);
  assert.deepStrictEqual(skipped, ['skipped marker comment https://example.test/c/1 by mallory (NONE) — not an owner, member, or collaborator']);
});

test('trustedMaterialityTexts treats a single string (local-files body) as trusted', () => {
  assert.deepStrictEqual(trustedMaterialityTexts('body'), { texts: ['body'], skipped: [] });
  assert.deepStrictEqual(trustedMaterialityTexts(undefined), { texts: [], skipped: [] });
});
```

The existing single-string and AC2-fold (`container` string) tests stay unchanged — the local-files shape is still trusted.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/health-core/materiality-digest.test.js`
Expected: FAIL after Step 1 — `trustedMaterialityTexts is not a function` and the AC1.1 assertions return `true`.

- [ ] **Step 3: Implement `trustedMaterialityTexts` and route `isMaterialityDuplicate` through it in `plugin/bin/lib/health-core/materiality-digest.js`**

Require `{ isTrustedComment, untrustedSkipNote }` from `'../issues/comment-trust'`. A string element of an array has no association, so `isTrustedComment` already fails it closed — pass the element itself to `untrustedSkipNote` (it tolerates non-objects). "Carries a marker" = `parseMaterialityFingerprints(body).length > 0`. Rewrite the header comment (lines 10-12) and the `isMaterialityDuplicate` doc comment (lines 64-68) to state the new contract: github-issues callers pass comment objects (`gh --json comments` elements or REST/MCP comments), only trusted-association comments count (#3766), a top-level string is the local-files body and is trusted. Export `trustedMaterialityTexts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/health-core/materiality-digest.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Prove AC3.1 — the untrusted-marker test goes red without the filter**

Temporarily change `isMaterialityDuplicate` to read every array element's body (`[].concat(existing || []).map((c) => (typeof c === 'string' ? c : c && c.body))`, no trust filter), run `node --test tests/bin-lib/health-core/materiality-digest.test.js`, confirm the `AC1.1` test FAILS, then restore the filtered implementation and re-run to PASS. Record both outcomes (test name + pass/fail) in the task report. Do not commit the mutation.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/health-core/materiality-digest.js tests/bin-lib/health-core/materiality-digest.test.js
git commit -m "Trust-filter materiality-digest dedup fingerprints — only owner/member/collaborator comments count (refs #3766)"
```

### Task 2: Caller contract — pass comment objects; the digest sweep reads trusted comments only

**Files:**
- Modify: `plugin/skills/_shared/materiality-floor.md` (`### Dedup` paragraph; `## Container` race-repair sentence)
- Modify: `plugin/skills/tidy/digest-sweep.md` (Bootstrap-race repair, Cluster promotion, Expiry)
- Test: `tests/materiality-floor-conformance.test.js` (the `#1279: dedup mechanism` block)

**Interfaces:**
- Consumes: Task 1's `isMaterialityDuplicate(existing, entry)` and `trustedMaterialityTexts(existing) -> { texts, skipped }`.
- Produces: prose contract only.

Moved-prose pin check: the phrases this task rewrites (`isMaterialityDuplicate(existingCommentBodies, candidate)`, `every comment on the open digest issue`, `across the container's comments`, `merge the newer issue's comments into the older`) are grepped under `tests/` and `plugin/`; the only pins are `tests/materiality-floor-conformance.test.js`'s `FLOOR.includes('isMaterialityDuplicate')`, `FLOOR.includes('bin/lib/health-core/materiality-digest.js')`, and `SWEEP.includes('isMaterialityDuplicate')` — keep all three literals present.

- [ ] **Step 1: Write the failing conformance assertions** (append to the `#1279: dedup mechanism` block)

```js
test('materiality-floor.md Dedup passes comment objects and counts only trusted-author markers (#3766)', () => {
  const dedup = FLOOR.slice(FLOOR.indexOf('### Dedup'), FLOOR.indexOf('### Direct-filing producers'));
  assert.ok(dedup.includes('isMaterialityDuplicate(existingComments, candidate)'));
  assert.ok(dedup.includes('authorAssociation'));
  assert.ok(dedup.includes('bin/lib/issues/comment-trust.js'));
  assert.ok(dedup.includes('Trusted authors'));
  assert.ok(!dedup.includes('existingCommentBodies'));
});

test('materiality-floor.md race repair and digest-sweep.md read only trusted digest comments (#3766)', () => {
  assert.ok(FLOOR.includes("merge the newer issue's trusted comments into the older"));
  assert.ok(SWEEP.includes("merge the newer issue's trusted comments into the older"));
  assert.ok(SWEEP.includes('trustedMaterialityTexts'));
  assert.ok(SWEEP.includes('Trusted authors'));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/materiality-floor-conformance.test.js`
Expected: FAIL after Step 1 — the two new tests (literals absent today).

- [ ] **Step 3: Edit the two contract files**

`materiality-floor.md` `### Dedup`: replace `isMaterialityDuplicate(existingCommentBodies, candidate)` with `isMaterialityDuplicate(existingComments, candidate)` and state that on `github-issues` the caller passes the digest issue's comment *objects* — each with its `body` and author association (`authorAssociation` from `gh issue view {n} --json comments`, `author_association` from REST/MCP) — never raw bodies; only a comment whose author is `OWNER`/`MEMBER`/`COLLABORATOR` counts (`_shared/pr-run-comments.md`'s Trusted authors, implemented by `bin/lib/issues/comment-trust.js`), so a marker planted by any other commenter cannot suppress a finding — it is routed as new. On `local-files` the caller passes the file body string (single-writer, trusted). Name each skipped marker comment in the run's output — `trustedMaterialityTexts(existingComments).skipped` returns those lines. `## Container`: change "merge the newer issue's comments into the older" to "merge the newer issue's trusted comments into the older" (an untrusted comment copied by the sweep would be re-authored as trusted).

`digest-sweep.md`: Bootstrap-race repair — "merge the newer issue's trusted comments into the older"; Cluster promotion — read active entry lines only from trusted comments (`trustedMaterialityTexts`, `_shared/materiality-floor.md`'s Dedup; `_shared/pr-run-comments.md`'s Trusted authors), naming each skipped marker comment in the sweep report, so a planted entry line can neither inflate a cluster to the ≥3 threshold nor be expired; Expiry — operates on the same trusted active set. Keep the existing `isMaterialityDuplicate` sentence. `digest-sweep.md` is inlined whole into a subagent's prompt, so state the rule in the file itself, not only by citation.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/materiality-floor-conformance.test.js`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/materiality-floor.md plugin/skills/tidy/digest-sweep.md tests/materiality-floor-conformance.test.js
git commit -m "Digest dedup contract passes comment objects; digest sweep reads trusted comments only (refs #3766)"
```

## Spec coverage

| Spec item | Task |
|---|---|
| Deliverable 1 — trusted-only fingerprints via `comment-trust.js` | Task 1 |
| Deliverable 2 — caller contract in materiality-floor.md + digest-sweep.md | Task 2 |
| Deliverable 3 — tests (untrusted not dup; trusted still dup) | Task 1 (AC1.1, AC2.1) |
| AC1.1 | Task 1 Step 1 `AC1.1:` test |
| AC2.1 | Task 1 Step 1 `AC2.1:` test |
| AC3.1 | Task 1 Step 5 (revert-to-red proof) |

## Build deviations (Common Step 4.5 — classified Beneficial)

| # | Deviation | Spec / plan said | Built | Why |
|---|---|---|---|---|
| 1 | Scope widened to the executing merge row | Key Files: `materiality-floor.md`, `digest-sweep.md` | Also `tidy/SKILL.md:136` (Action Vocabulary `Merge-close duplicate digest` row) and `tidy/step-6-auto.md:60`, both now trusted-comments-only, pinned in `tests/materiality-floor-conformance.test.js` | `/tidy` Step 7 executes the bootstrap merge from the SKILL.md row, not from `digest-sweep.md`; leaving it unfiltered kept the laundering path (an untrusted marker re-posted under a MEMBER identity) the reader inventory set out to close — final whole-branch review finding 1 (fc7fdabef) |
| 2 | Bare-string array element gets its own skip note | Task 1: bare string is simply untrusted | `BARE_STRING_SKIP_NOTE` emitted for a marker-carrying bare string; still untrusted, never throws | A caller still passing raw bodies (the pre-#3766 shape) would otherwise disable dedup silently — final review finding 3; ruling staged as `sdd-ruling-1` |
| 3 | Sweep reads comment objects via inlined jq | Task 2: point the sweep at `trustedMaterialityTexts` | `digest-sweep.md` filters comment objects with the Trusted-authors jq `select(...)` and skip-note line (byte-pinned against `comment-trust.js`), keeping url/id/createdAt | Promotion/expiry markers and the expiry timestamp fallback need per-comment identity that `.texts` drops; the file is inlined into a subagent that cannot `require` the module — final review finding 2 |
