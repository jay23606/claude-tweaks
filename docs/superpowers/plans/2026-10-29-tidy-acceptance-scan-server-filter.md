# Tidy Acceptance Scan Server-Side Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/tidy`'s `acceptance-gap` and `parent-gate` scans from hitting `backlog-fetch-limit` on a large repo. Narrow both unbounded fetches on the server side, and keep every client-side check and truncation warning.

**Architecture:** This is a prose and fence change to one shared contract, `plugin/skills/_shared/github-pr-scan-acceptance.md`.
- **acceptance-gap.** The closed-record fetch gains a `--search` string. It holds the 30-day cutoff (`$SINCE`, a literal substituted from `{since-date}`) and excludes records that already carry an acceptance disposition, plus not-planned and duplicate closures. These are the cases `needsBackstop` already rejects. The client-side filters stay as they are.
- **parent-gate.** Under `work-links: native`, the state map narrows to `has:parent-issue`, which is exactly the native sub-issue population. Under `body-text` it stays unfiltered.
- **Search cap.** A searched fetch is capped at 1000 by GitHub's search API, whatever `--limit` says. Every warning on a searched fetch therefore compares against `Math.min(LIMIT, 1000)`.

**Tech Stack:** Markdown skill prose, bash fences, `gh` CLI search qualifiers, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-10-29T011734-record-4469/work/4469-spec.md`

## Global Constraints

- Keep the truncation warning for the narrowed fetch (spec Deliverables: "Keep the truncation warning for the narrowed fetch.").
- On this repo, a tidy run's acceptance-gap fetch returns fewer rows than `backlog-fetch-limit` and reports no truncation warning (spec AC).
- `{resolved-limit}`, `{since-date}` and `{state-map-search}` are substituted as literals per block. They are never carried across Bash calls in a shell variable (the file's existing "Fetch limit" discipline). Inside a block, a literal assigned to a variable (`SINCE="{since-date}"`) is fine. That is the existing `LIMIT="{resolved-limit}"` pattern, and the fence-guard detector treats such names as static.
- No fence may add a shape that `tests/skill-fence-guard-shapes.test.js` flags, and no new allowlist entry may be added.
- `plugin/skills/_shared/github-pr-scan-acceptance.md` stays under `RAIL_BYTES` (52500). It is 41783 bytes today.
- Governing skill `skill-prose-conformance-tests` (quoted verbatim):
  - "Read live prose only when the prose is the declared contract". Here it is: the fence is the command tidy's scan agent runs.
  - "freeze the bytes the change *replaced* as a fixture constant inside the test, then assert every pattern twice — it matches the live file, and it does **not** match the frozen excerpt."
  - "For an adjacency or ordering claim, build the control so it carries the anchor and lacks only the thing being pinned, and run the *same* extraction over both".

## Probes run at plan time (Verbatim-command / Derived-value / Empty-value checks)

- Resolver values on this machine (`plugin/bin/resolve-policy.js --values backlog-fetch-limit work-links`): `1000`, `native`.
- `{since-date}` one-liner `node -e "console.log(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))"` printed `2026-09-29`.
- `gh issue list --state closed --limit 1000 --search 'closed:>=2026-09-29 -reason:"not planned" -reason:duplicate -label:demo:approved -label:demo:changes-requested -label:demo:pending' --json stateReason` returned 743 rows, all `COMPLETED`. Without the disposition and reason qualifiers it returned 866 (800 COMPLETED, 64 NOT_PLANNED, 2 DUPLICATE). The unfiltered `--state closed --limit 1000` returns exactly 1000, which is today's warning.
- `closed:>=@today-30d` returned 0, so relative dates are unsupported. An empty `{since-date}` (`closed:>=`) also returned 0, which fails in the quiet direction. The node block therefore throws unless `SINCE` matches `^\d{4}-\d{2}-\d{2}$`.
- `gh issue list --state all --search "has:parent-issue" --limit 1000` returned 254 rows. These included every sub-issue `bin/fetch-sub-issues.js --resolve-retries 4031 3972 3944` reported for the three open parents.
- Search API ceiling: `--search "sort:created-desc" --limit 1500` returned 1000. An empty `--search "" --limit 1500` returned 1500, because the ordinary listing is used, with no ceiling.
- An unsubstituted `{state-map-search}` literal would search for that text and return 0, so every sub-issue would read OPEN. The node block therefore throws unless `STATE_SEARCH` is `''` or `has:parent-issue`.

## Review Focus

- **Search's 1000-result ceiling.** Suppose `backlog-fetch-limit` is set above 1000 and the searched fetch returns exactly 1000 rows. It must still warn, because the old `raw.length === LIMIT` test would stay silent. Pinned by Task 1's `searched fetches warn at the search ceiling` and Task 2's `state-map warning honours the search ceiling`.
- **Server filter drops a real gap.** Each negated label in the search string must be one `dispositionState` classifies as a disposition. Otherwise the server would hide a record that `needsBackstop` reports. Pinned by Task 1's `negated labels are exactly needsBackstop dispositions`.
- **Null `stateReason`.** A closed record with no recorded reason must stay in the result set. Negated `-reason:` qualifiers keep it, and a positive `reason:completed` would drop it. Pinned by Task 1's `never filters on a positive reason`.
- **Unsubstituted or empty placeholder.** An empty `{since-date}`, or a placeholder left unsubstituted, silently returns 0 rows and therefore 0 gaps. Pinned by Task 1's `since-date is validated` and Task 2's `state-map search is validated`.
- **body-text state map.** Under `work-links: body-text`, task-list children are not native links. The state map must stay unfiltered, or every sub-issue defaults to OPEN. Pinned by Task 2's `state map search is branch-resolved`.

---

### Task 1: Server-filter the acceptance-gap closed-record fetch

**Role:** integration

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md` — the `acceptance-gap` scope's "Record set" paragraph and closed-record fetch fence (lines 53-75), and the "Fetch limit" paragraph beginning "A 30-day window does not bound…" (lines 119-126). The scope's two parent-fetch blocks are not searched and stay untouched.
- Create: `tests/acceptance-scan-server-filter.test.js`

**Interfaces:**
- Consumes: `dispositionState(labels: string[]) -> 'approved'|'changes-requested'|'pending'|'none'` from `plugin/bin/lib/issues/acceptance.js`; the `read(rel)` helper pattern of `tests/fetch-sub-issues-prose-conformance.test.js` (via `tests/helpers/read-skill`).
- Produces: `section(text: string, startHeading: string, endHeading: string|null) -> string` and `assertClaimPinned(live: string, frozen: string, pattern: RegExp, msg: string)` in the test file. Task 2 reuses both.

- [ ] **Step 1: Write the failing test** in `tests/acceptance-scan-server-filter.test.js`.
  - **Setup.** `GAP = section(liveText, '## Scope: \`acceptance-gap\`', '## Scope: \`parent-gate\`')`. Freeze `PRE_CHANGE_GAP_FETCH` as a string constant holding the replaced lines verbatim: `gh issue list --state closed --limit "$LIMIT" \` / `  --json number,title,state,labels,closedAt,stateReason \` / `  > "$RAW"` followed by `  if (raw.length === LIMIT) {`. Every positive pattern goes through `assertClaimPinned(GAP, PRE_CHANGE_GAP_FETCH, …)`.
  - `closed-record fetch is server-filtered`: pattern `/gh issue list --state closed --limit "\$LIMIT" \\\n\s+--search "closed:>=\$SINCE -reason:\\"not planned\\" -reason:duplicate -label:demo:approved -label:demo:changes-requested -label:demo:pending"/`. Also assert that every `gh issue list --state closed` occurrence in `GAP` is followed within 120 chars by `--search`, and that `GAP` contains at least one occurrence (anchor present).
  - `negated labels are exactly needsBackstop dispositions`: extract every `-label:(\S+?)(?="|\s)` from the live search string. `assert.deepEqual(sorted, ['demo:approved','demo:changes-requested','demo:pending'])`, and assert `dispositionState([l]) !== 'none'` for each one.
  - `never filters on a positive reason`: the live search string has no `/(?<!-)reason:/` match.
  - `searched fetches warn at the search ceiling`: `assertClaimPinned` on `/const CAP = Math\.min\(LIMIT, 1000\);\s*if \(raw\.length >= CAP\)/`. Also assert that `GAP` no longer contains `raw.length === LIMIT`.
  - `since-date is validated`: `assertClaimPinned` on `/SINCE="\{since-date\}"/` and on `/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(process\.env\.SINCE/`. Also assert `GAP` names the one-liner text `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/acceptance-scan-server-filter.test.js`
Expected: FAIL — `closed-record fetch is server-filtered` fails because there is no `--search` in the live fence.

- [ ] **Step 3: Edit the acceptance-gap scope.**
  - **"Record set" paragraph.** State that the 30-day window and the disposition, not-planned and duplicate exclusions are applied server-side through `--search`, and that the client-side cutoff and `needsBackstop` still run on the narrowed set, unchanged. State that `{since-date}` is resolved first, as its own call, with the one-liner above, and its `YYYY-MM-DD` output is substituted literally.
  - **Explanatory sentence.** Negated `-reason:` qualifiers are used rather than `reason:completed`, so that a closed record with a null `stateReason` stays in.
  - **Fence.** Add `SINCE="{since-date}"` and `export SINCE`. Insert `--search "closed:>=$SINCE -reason:\"not planned\" -reason:duplicate -label:demo:approved -label:demo:changes-requested -label:demo:pending" \` as the line after `gh issue list --state closed --limit "$LIMIT" \`. Keep the `--json` fields and the redirect.
  - **Node block, first statement.** Throw unless `/^\d{4}-\d{2}-\d{2}$/.test(process.env.SINCE || '')`. The message says `{since-date}` was not substituted and that an empty date returns zero rows.
  - **Node block, warning.** Replace `if (raw.length === LIMIT)` with `const CAP = Math.min(LIMIT, 1000); if (raw.length >= CAP)`. The message says the server-filtered fetch reached its cap, which is the smaller of `backlog-fetch-limit` and GitHub search's 1000-result ceiling. Records past it are invisible, so the reader should raise `backlog-fetch-limit` when it is below 1000. At 1000 or above, the 30-day undisposed set itself exceeds the search ceiling and the scope cannot be complete. Keep the `closedAt > cutoff` filter and the write.
  - **"A 30-day window…" paragraph.** Rewrite it to say the closed-record fetch is now bounded by the window and the disposition filter on the server. Keep the "971 closed issues in 30 days" observation, because it is why the cap and warning still matter. Keep the parent-fetch half of the paragraph unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/acceptance-scan-server-filter.test.js tests/skill-fence-guard-shapes.test.js tests/fetch-sub-issues-prose-conformance.test.js tests/session-tmp-root-migration.test.js`
Expected: PASS (all four files, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add tests/acceptance-scan-server-filter.test.js plugin/skills/_shared/github-pr-scan-acceptance.md
git commit -m "Server-filter tidy acceptance-gap closed fetch — refs #4469"
```

### Task 2: Narrow the parent-gate state map under native work-links

**Role:** integration

**Files:**
- Modify: `plugin/skills/_shared/github-pr-scan-acceptance.md` — the `parent-gate` scope. Move its `### \`work-links\` resolution` section (currently lines 424-442) to sit directly above its `### Fetch limit` section (currently line 363). Edit the Fetch-limit paragraph (lines 365-377), the state-map fence (lines 381-413), and the paragraph after it (lines 415-417).
- Modify: `tests/acceptance-scan-server-filter.test.js`

**Deictic re-resolution (reorder):** the moved section's "the two branches below" still points down to `### Sub-issue enumeration`'s branches after the move. The Fetch-limit text's "every fetch below" still points down to the fence. `### Sub-issue enumeration`'s "the state map just fetched above" and the oversight pre-filter's "this scope's own Fetch-limit and `work-links` resolutions state above" both stay correct. No deictic needs flipping. Re-read all four after the move.

**Interfaces:**
- Consumes: `section`, `assertClaimPinned` from Task 1's test file.
- Produces: the `{state-map-search}` placeholder (literal `has:parent-issue` under `native`, empty under `body-text`) and the `STATE_SEARCH` env var.

- [ ] **Step 1: Write the failing test** by appending to `tests/acceptance-scan-server-filter.test.js`.
  - **Setup.** `PG = section(liveText, '## Scope: \`parent-gate\`', null)`. Freeze `PRE_CHANGE_PG` as a constant holding the replaced bytes, in this order: the old `### Fetch limit` heading line, then `gh issue list --state all --json number,state,labels --limit "$LIMIT" \`, then `  if (states.length === LIMIT) {`, then the old `### \`work-links\` resolution` heading line. It carries both ordering anchors in the pre-change order.
  - `state map search is branch-resolved`: `assertClaimPinned(PG, PRE_CHANGE_PG, …)` on `/STATE_SEARCH='\{state-map-search\}'/`, `/export STATE_SEARCH/`, and `/gh issue list --state all --search "\$STATE_SEARCH" --json number,state,labels --limit "\$LIMIT"/`. Plain asserts that `PG` names `has:parent-issue` and `body-text` within 400 chars of `{state-map-search}`.
  - `work-links resolved before the state-map fetch`: an `orderOk(text)` helper returns true when `text.indexOf('### \`work-links\` resolution') < text.indexOf('### Fetch limit')` and both are found. `assert.ok(orderOk(PG))`, `assert.ok(!orderOk(PRE_CHANGE_PG))`. The same extraction runs on both, and the control carries both anchors.
  - `state-map warning honours the search ceiling`: `assertClaimPinned` on `/const STATE_CAP = process\.env\.STATE_SEARCH \? Math\.min\(LIMIT, 1000\) : LIMIT;\s*if \(states\.length >= STATE_CAP\)/`.
  - `state-map search is validated`: `assertClaimPinned` on `/\['', 'has:parent-issue'\]\.includes\(process\.env\.STATE_SEARCH\)/`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/acceptance-scan-server-filter.test.js`
Expected: FAIL — `state map search is branch-resolved` fails because there is no `STATE_SEARCH` yet. Task 1's tests still pass.

- [ ] **Step 3: Edit the parent-gate scope.**
  - **Move.** Move the `work-links` resolution section above "Fetch limit". Add one sentence to it: its value also selects the state map's `{state-map-search}` value below.
  - **Fetch-limit paragraph.** Scope "`--state all` over the repo's entire lifetime with no recency bound" to `body-text`. Under `native` the map is searched, so the 1000-result ceiling also applies.
  - **Fence.** Add `STATE_SEARCH='{state-map-search}'` and `export STATE_SEARCH`. Change the state-map call to `gh issue list --state all --search "$STATE_SEARCH" --json number,state,labels --limit "$LIMIT" \`.
  - **Node block, first statement.** Throw unless `['', 'has:parent-issue'].includes(process.env.STATE_SEARCH)`. The message says the placeholder was not substituted.
  - **Node block, warning.** The state-map warning becomes `const STATE_CAP = process.env.STATE_SEARCH ? Math.min(LIMIT, 1000) : LIMIT; if (states.length >= STATE_CAP)`. Its message names the cap, the default-to-OPEN consequence, and that raising `backlog-fetch-limit` past 1000 does not help a searched map.
  - **Prose after the fence.** Substitute `has:parent-issue` under `native`, because it is exactly the native sub-issue population: verified live, it returned 254 rows that included every sub-issue of the open parents. Substitute the empty string under `body-text`, because task-list children are not native links. An empty `--search` keeps `gh issue list` on the ordinary listing rather than the search API, so there is no 1000 ceiling: verified live, `--limit 1500` returned 1500 rows.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/acceptance-scan-server-filter.test.js tests/skill-fence-guard-shapes.test.js tests/fetch-sub-issues-prose-conformance.test.js tests/session-tmp-root-migration.test.js`
Expected: PASS (all four files, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add tests/acceptance-scan-server-filter.test.js plugin/skills/_shared/github-pr-scan-acceptance.md
git commit -m "Narrow tidy parent-gate state map to native sub-issues — refs #4469"
```

- [ ] **Step 6: Verify AC1.1 live (orchestrator, after the commit — scratch, never committed)**

This step covers AC1.1 ("On this repo a tidy run's acceptance-gap fetch returns fewer rows than backlog-fetch-limit and reports no truncation warning."), which is a live check against this repo. The orchestrator runs the shipped acceptance-gap fence's `gh` call and node warning block, with `{since-date}` from the one-liner and `{resolved-limit}` from the resolver. It writes the full output to `$PIPELINE_RUN_DIR/evidence/ac-acceptance-gap-fetch.txt` (after `mkdir -p` of that absolute directory), using a plain Bash redirect. It then logs one `decisions.md` entry via `log-decision.js --section "/build" --status AUTO --step "AC evidence" --text-file {file}`. That entry gives the AC wording, the command shape, the row count against the limit, and whether a WARNING line was printed, and cites the evidence path. Expected: a row count below 1000 and no WARNING line.
