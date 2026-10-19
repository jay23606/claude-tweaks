# PR-Check Gate Inherited-Red Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a pr-first run's PR is red only on checks that are already failing at the integration branch tip, `/test`'s and `/review`'s PR-check gate passes with a logged caveat instead of stopping; mixed red still stops on the attributable checks only; an unreadable base stays plain red.

**Architecture:** `bin/pr-checks.js` keeps its existing PR read. Only when the classified verdict is `red` does it read the integration tip (sha, check-runs, commit statuses, workflow runs) and hand the result to two new pure helpers in `bin/lib/pr-checks/classify.js`: `failingNamesAt` (base failing-name set) and `applyBaseComparison` (flags each failing entry `inherited`, promotes all-inherited to `inherited-red`, leaves plain `red` + `baseReason` when the base read failed). `_shared/pr-check-gate.md` routes the new state.

**Tech Stack:** Node 18+ CommonJS, `node --test`, `gh` CLI (REST via `gh api`, `gh run list`).

**Spec:** `.claude-tweaks/pipelines/2026-10-19T131646-record-3258/work/3258-spec.md`

Scope keywords: pr-checks, pr-check-gate, inherited-red

Premise-refs: plugin/bin/pr-checks.js
Premise-refs: plugin/bin/lib/pr-checks/classify.js
Premise-refs: plugin/skills/_shared/pr-check-gate.md
Premise-refs: plugin/bin/lib/hooks/worktree-reap.js

## Global Constraints

- The base read runs **only** when the PR verdict is `red` (record: "when the PR read is `red`, also read the integration branch tip's check runs").
- A check is `inherited` when "the same check name is failing at the base tip", `attributable` otherwise — match on name, exact string equality.
- "An unreadable base tip leaves the read as plain `red` (never green)" — any base-read failure (branch unresolvable, gh throw, unparseable JSON, non-40-hex sha) yields `state: 'red'`, `failing` unchanged (no `inherited` flags), plus `baseReason`.
- `pr-checks.js` stays status-as-data: exit 0 in every state; exit codes 2/3 unchanged.
- Every `gh` call keeps `timeout: GH_TIMEOUT_MS` and `windowsHide: true` via the existing `realDeps.gh` (no new spawn sites).
- Integration branch comes from the shared resolver — `resolveIntegrationBranch` + `bareIntegrationName` from `plugin/bin/lib/hooks/worktree-reap.js` (as `plugin/bin/lib/merge-verification.js` already does) — never hand-rolled, never a hardcoded `main`.
- The merge gate (`_shared/pr-first-merge.md` Step 2.5) is out of scope and keeps its own read; `inherited-red` never authorizes a merge.
- Commit messages: `{Verb} {what} — {detail}`, body line `refs #3258` (never `closes`/`fixes`), trailer `Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD`.

## Verified command shapes (Verbatim-command run-once, 2026-10-19, read-only against thn-inc/claude-tweaks)

- `gh api repos/{owner}/{repo}/commits/main --jq .sha` → `3eb0ad222f7da423246a399bc3c9f53896e8b0df` (bare 40-hex line).
- `gh api "repos/{owner}/{repo}/commits/{sha}/check-runs?per_page=100"` → object `{total_count, check_runs:[{name, status:"completed", conclusion:"failure"|"cancelled"|"skipped"|"success", html_url, ...}]}` — **lowercase** status/conclusion.
- `gh api repos/{owner}/{repo}/commits/{sha}/status` → object `{state, statuses:[{context, state, target_url}]}` (empty `statuses` at the probed tip).
- `gh run list --commit {sha} --limit 100 --json name,workflowName,status,conclusion,url` → array, lowercase status/conclusion.
- Real-input probe (main commit `e91df452cc1bd26f5d550b44eba51471db3898bb`): check-runs failing = job `file`; workflow runs failing = `windows-regression` (`test` was `cancelled`, not failing). So the base failing set there is exactly `['file', 'windows-regression']` — a job name AND its workflow name, which is why the base read must union check-runs and workflow runs (a PR's `failing[]` names both, via the rollup and `headRuns`). Task 1's real-shape test pins this exact set.

## Review Focus

1. A failing entry whose `name` is null (malformed CheckRun) — must never be marked inherited, even if the base set is empty-named. Pinned in Task 1.
2. A base tip whose checks are still in progress (`status: in_progress`, `conclusion: null`) — not failing at base, so the PR's same-named failure is attributable and the read stays `red`. Pinned in Task 1.
3. The integration-branch resolver returning `null` or throwing — plain `red` with `baseReason`, no `gh api` call made. Pinned in Task 2.
4. A base-sha response that is not a 40-hex sha (empty string, error text) — plain `red`, no check-runs call. Pinned in Task 2.
5. Non-red verdicts (`green`, `pending`, `stale`) must not trigger any base read — zero extra `gh` calls. Pinned in Task 2.

---

### Task 1: Pure base-comparison helpers in classify.js

**Files:**
- Modify: `plugin/bin/lib/pr-checks/classify.js` (add two functions + exports; update header comment)
- Test: `tests/bin-lib/pr-checks/classify.test.js` (append)

**Interfaces:**
- Consumes: existing `FAILING_CONCLUSIONS`, `normalizeEntry`, `normalizeHeadRun` in the same file.
- Produces:
  - `failingNamesAt({ checkRuns, statuses, runs }) -> string[]` — de-duplicated names (non-null) whose normalized conclusion is in `FAILING_CONCLUSIONS`. `checkRuns` and `runs` rows go through `normalizeHeadRun` (uppercases lowercase REST values; `workflowName || name`); `statuses` rows (`{context, state, target_url}`) go through `normalizeEntry`. Throws `Error('malformed base read: <field>')` when any of the three is not an array.
  - `applyBaseComparison(verdict, base) -> verdict` — `base` is `{ sha: string, failing: string[] }` on success or `{ sha: string|null, reason: string }` on failure.
    - `verdict.state !== 'red'` → returns `verdict` unchanged (same object).
    - `base` missing or carrying `reason` → `{ ...verdict, state: 'red', baseSha: base?.sha ?? null, baseReason: base?.reason || 'base not read' }`, `failing` untouched (no `inherited` keys).
    - otherwise → `failing` mapped to `{ ...f, inherited: f.name != null && base.failing.includes(f.name) }`; `state` is `'inherited-red'` when `failing.length > 0` and every entry is inherited, else `'red'`; adds `baseSha: base.sha`.
  - `module.exports` gains `failingNamesAt`, `applyBaseComparison`.

- [ ] **Step 1: Write the failing tests** (append to `tests/bin-lib/pr-checks/classify.test.js`; update its `require` to also take `failingNamesAt, applyBaseComparison`)

```js
const BASE = 'b'.repeat(40);
const redVerdict = (names) => ({ state: 'red', failing: names.map((n) => ({ name: n, url: `https://ci.example/${n}` })), pending: [], headRefOid: HEAD });

test('failingNamesAt: real e91df452c shape — job name and workflow name both count', () => {
  const checkRuns = [
    { name: 'file', status: 'completed', conclusion: 'failure' },
    { name: 'test', status: 'completed', conclusion: 'cancelled' },
    { name: 'windows', status: 'completed', conclusion: 'success' },
  ];
  const runs = [
    { name: 'windows-regression', workflowName: 'windows-regression', status: 'completed', conclusion: 'failure' },
    { name: 'test', workflowName: 'test', status: 'completed', conclusion: 'cancelled' },
  ];
  assert.deepEqual(failingNamesAt({ checkRuns, statuses: [], runs }), ['file', 'windows-regression']);
});

test('failingNamesAt: a failed commit status counts; in-progress and null-named rows do not', () => {
  const names = failingNamesAt({
    checkRuns: [{ name: 'lint', status: 'in_progress', conclusion: null }, { name: null, status: 'completed', conclusion: 'failure' }],
    statuses: [{ context: 'ci/legacy', state: 'failure', target_url: 'u' }, { context: 'ci/ok', state: 'success' }],
    runs: [],
  });
  assert.deepEqual(names, ['ci/legacy']);
});

test('failingNamesAt: a non-array field throws (CLI maps it to plain red)', () => {
  assert.throws(() => failingNamesAt({ checkRuns: {}, statuses: [], runs: [] }), /malformed base read/);
});

test('AC1.1: every failing check also failing at base -> inherited-red with baseSha', () => {
  const r = applyBaseComparison(redVerdict(['test']), { sha: BASE, failing: ['test', 'other'] });
  assert.equal(r.state, 'inherited-red');
  assert.equal(r.baseSha, BASE);
  assert.deepEqual(r.failing, [{ name: 'test', url: 'https://ci.example/test', inherited: true }]);
});

test('AC2.1: one inherited + one new failing check stays red, flagging only the new one attributable', () => {
  const r = applyBaseComparison(redVerdict(['test', 'lint']), { sha: BASE, failing: ['test'] });
  assert.equal(r.state, 'red');
  assert.deepEqual(r.failing.filter((f) => !f.inherited).map((f) => f.name), ['lint']);
  assert.deepEqual(r.failing.filter((f) => f.inherited).map((f) => f.name), ['test']);
});

test('AC3.1: an unreadable base leaves plain red, never green, with baseReason and no inherited flags', () => {
  const v = redVerdict(['test']);
  const r = applyBaseComparison(v, { sha: null, reason: 'gh api failed: HTTP 502' });
  assert.equal(r.state, 'red');
  assert.equal(r.baseReason, 'gh api failed: HTTP 502');
  assert.equal(r.baseSha, null);
  assert.deepEqual(r.failing, v.failing);
  assert.equal(applyBaseComparison(v, undefined).state, 'red');
});

test('a base check still in progress is not failing there, so the PR failure is attributable', () => {
  const failing = failingNamesAt({ checkRuns: [{ name: 'test', status: 'in_progress', conclusion: null }], statuses: [], runs: [] });
  const r = applyBaseComparison(redVerdict(['test']), { sha: BASE, failing });
  assert.equal(r.state, 'red');
  assert.equal(r.failing[0].inherited, false);
});

test('a null-named failing entry is never inherited', () => {
  const r = applyBaseComparison({ state: 'red', failing: [{ name: null, url: null }], pending: [], headRefOid: HEAD }, { sha: BASE, failing: [] });
  assert.equal(r.state, 'red');
  assert.equal(r.failing[0].inherited, false);
});

test('non-red verdicts pass through unchanged (same object)', () => {
  for (const state of ['green', 'pending', 'stale', 'no-ci', 'read-failed']) {
    const v = { state, failing: [], pending: [], headRefOid: HEAD };
    assert.equal(applyBaseComparison(v, { sha: BASE, failing: ['x'] }), v);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/pr-checks/classify.test.js`
Expected: FAIL — `failingNamesAt is not a function` / `applyBaseComparison is not a function`.

- [ ] **Step 3: Implement `failingNamesAt` and `applyBaseComparison` in `plugin/bin/lib/pr-checks/classify.js`**

Reuse `normalizeHeadRun`/`normalizeEntry`; order of returned names = first-seen order across checkRuns, statuses, runs. Extend the header comment with one paragraph: the base comparison (#3258) is an addition the merge gate does not have; it can only demote `red` to `inherited-red`, and a failed base read leaves `red` (a corroborating read's failure only touches verdicts it could change).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/pr-checks/classify.test.js`
Expected: PASS, all tests (pre-existing ones included).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/pr-checks/classify.js tests/bin-lib/pr-checks/classify.test.js
git commit -m "Add base-tip comparison helpers to pr-checks classify — inherited vs attributable failing checks" -m "refs #3258" -m "Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD"
```

---

### Task 2: Base-tip read in bin/pr-checks.js

**Files:**
- Modify: `plugin/bin/pr-checks.js` (header comment, `USAGE`, `realDeps`, new `readBase`, `run`)
- Modify: `docs/plugin-structure.md` (line 43 `plugin/bin/lib/pr-checks/` entry; line 177 `pr-checks.js` CLI entry — add the base comparison and the `inherited-red` state)
- Test: `tests/bin-lib/pr-checks/cli.test.js` (append)

**Interfaces:**
- Consumes: `failingNamesAt`, `applyBaseComparison` (Task 1); `resolveIntegrationBranch`, `bareIntegrationName` from `./lib/hooks/worktree-reap`.
- Produces:
  - `realDeps.integrationBranch: (repoRoot) => bareIntegrationName(resolveIntegrationBranch(repoRoot))` — injectable; tests pass `integrationBranch: () => 'main'`.
  - `readBase(deps, repoRoot) -> { sha, failing } | { sha, reason }` (not exported). Calls, in order, each through `deps.gh`, stopping at the first failure:
    1. `['api', 'repos/{owner}/{repo}/commits/' + branch, '--jq', '.sha']` — trimmed output must match `/^[0-9a-f]{40}$/`, else `reason: 'base sha unreadable: <output>'`.
    2. `['api', 'repos/{owner}/{repo}/commits/' + sha + '/check-runs?per_page=100']` → `.check_runs`
    3. `['api', 'repos/{owner}/{repo}/commits/' + sha + '/status']` → `.statuses`
    4. `['run', 'list', '--commit', sha, '--limit', '100', '--json', 'name,workflowName,status,conclusion,url']`
    then `failingNamesAt({ checkRuns, statuses, runs })` inside the same try. Branch null/empty/throw → `{ sha: null, reason: 'integration branch unresolvable…' }` with no gh call. Any gh throw/parse error → `reason` prefixed `base read failed: ` + `errText(e)`.
  - `run`: after the existing `runsFailure` check, `const final = verdict.state === 'red' ? applyBaseComparison(verdict, readBase(deps, repoRoot)) : verdict;` and report `final`. Output JSON may now carry `baseSha`, `baseReason`, per-entry `inherited`; state list gains `inherited-red`.
  - `USAGE` and header comment: state list becomes `red | inherited-red | pending | stale | green | no-ci | read-failed | no-pr | gh-absent`; fields add `baseSha?, baseReason?`.

- [ ] **Step 1: Write the failing tests** (append to `tests/bin-lib/pr-checks/cli.test.js`)

```js
const BASE_SHA = 'e'.repeat(40);
// gh fake for a red PR (failing: given names) and a base tip failing `baseFailing` (as check-run names).
function redWithBase(prFailing, baseFailing, over = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args[0] === 'pr') return JSON.stringify({ headRefOid: HEAD, statusCheckRollup: prFailing.map((n) => ({ __typename: 'CheckRun', name: n, status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: `https://ci.example/${n}` })) });
    if (args[0] === 'run' && args[3] === HEAD) return '[]';
    if (args[0] === 'api' && args[1] === 'repos/{owner}/{repo}/commits/main') return `${BASE_SHA}\n`;
    if (args[0] === 'api' && args[1] === `repos/{owner}/{repo}/commits/${BASE_SHA}/check-runs?per_page=100`) return JSON.stringify({ total_count: baseFailing.length, check_runs: baseFailing.map((n) => ({ name: n, status: 'completed', conclusion: 'failure' })) });
    if (args[0] === 'api' && args[1] === `repos/{owner}/{repo}/commits/${BASE_SHA}/status`) return JSON.stringify({ state: 'failure', statuses: [] });
    if (args[0] === 'run' && args[3] === BASE_SHA) return '[]';
    throw new Error('unexpected gh ' + args.join(' '));
  };
  return { calls, over: { integrationBranch: () => 'main', gh, ...over } };
}

test('AC1.1: a PR red only on a check also red at the integration tip reads inherited-red, naming baseSha', () => {
  const { main, runDir } = fixture({ pr: { number: 7 } });
  const f = redWithBase(['test'], ['test']);
  const h = makeDeps(main, f.over);
  assert.equal(run(['--run', runDir], h.deps), 0);
  const j = h.json();
  assert.equal(j.state, 'inherited-red');
  assert.equal(j.baseSha, BASE_SHA);
  assert.deepEqual(j.failing, [{ name: 'test', url: 'https://ci.example/test', inherited: true }]);
  assert.deepEqual(f.calls.find((a) => a[0] === 'run' && a[3] === BASE_SHA), ['run', 'list', '--commit', BASE_SHA, '--limit', '100', '--json', 'name,workflowName,status,conclusion,url']);
});

test('AC2.1: one inherited + one new failing check stays red; only the new one is attributable', () => {
  const { main, runDir } = fixture({ pr: { number: 7 } });
  const h = makeDeps(main, redWithBase(['test', 'lint'], ['test']).over);
  assert.equal(run(['--run', runDir], h.deps), 0);
  const j = h.json();
  assert.equal(j.state, 'red');
  assert.deepEqual(j.failing.filter((x) => !x.inherited).map((x) => x.name), ['lint']);
});

test('AC3.1: a base read that throws leaves plain red (never green) with baseReason', () => {
  const { main, runDir } = fixture({ pr: { number: 7 } });
  const f = redWithBase(['test'], ['test']);
  const h = makeDeps(main, { ...f.over, gh: (args) => { if (args[0] === 'api') throw new Error('HTTP 502'); return f.over.gh(args); } });
  assert.equal(run(['--run', runDir], h.deps), 0);
  const j = h.json();
  assert.equal(j.state, 'red');
  assert.match(j.baseReason, /HTTP 502/);
  assert.deepEqual(j.failing, [{ name: 'test', url: 'https://ci.example/test' }]);
});

test('an unresolvable integration branch is plain red and makes no gh api call', () => {
  for (const integrationBranch of [() => null, () => { throw new Error('no origin'); }]) {
    const { main, runDir } = fixture({ pr: { number: 7 } });
    const f = redWithBase(['test'], ['test'], { integrationBranch });
    const h = makeDeps(main, f.over);
    assert.equal(run(['--run', runDir], h.deps), 0);
    assert.equal(h.json().state, 'red');
    assert.ok(h.json().baseReason);
    assert.equal(f.calls.some((a) => a[0] === 'api'), false);
  }
});

test('a non-sha base response is plain red and skips the check-runs read', () => {
  const { main, runDir } = fixture({ pr: { number: 7 } });
  const f = redWithBase(['test'], ['test']);
  const h = makeDeps(main, { ...f.over, gh: (args) => (args[1] === 'repos/{owner}/{repo}/commits/main' ? 'Not Found\n' : f.over.gh(args)) });
  assert.equal(run(['--run', runDir], h.deps), 0);
  assert.equal(h.json().state, 'red');
  assert.match(h.json().baseReason, /base sha unreadable/);
  assert.equal(f.calls.some((a) => String(a[1]).includes('/check-runs')), false);
});

test('green, pending and stale verdicts never read the base tip', () => {
  const rollups = {
    green: [{ __typename: 'CheckRun', name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    pending: [{ __typename: 'CheckRun', name: 'test', status: 'IN_PROGRESS', conclusion: '' }],
  };
  for (const [state, rollup] of Object.entries(rollups)) {
    const { main, runDir } = fixture({ pr: { number: 7 } });
    const calls = [];
    const h = makeDeps(main, { integrationBranch: () => 'main', gh: (args) => { calls.push(args); return args[0] === 'pr' ? JSON.stringify({ headRefOid: HEAD, statusCheckRollup: rollup }) : '[]'; } });
    assert.equal(run(['--run', runDir], h.deps), 0);
    assert.equal(h.json().state, state);
    assert.equal(calls.some((a) => a[0] === 'api'), false);
  }
});
```

(`stale` already never reaches classification of red, and an existing test covers its runs-skip; the loop above pins green and pending.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/pr-checks/cli.test.js`
Expected: FAIL — AC1.1 test reports `state` `red` (not `inherited-red`); `baseReason` undefined.

- [ ] **Step 3: Implement `readBase` and the `run` change in `plugin/bin/pr-checks.js`; update `USAGE`, the header comment, and both `docs/plugin-structure.md` entries**

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/pr-checks/cli.test.js tests/bin-lib/pr-checks/classify.test.js`
Expected: PASS (pre-existing CLI tests included — their red cases now carry a `baseReason` from the default fake's `unexpected gh api` throw, and their `failing` deepEquals are unchanged because a failed base read adds no `inherited` keys).

- [ ] **Step 5: Real-input check** — from the worktree, with the real `gh`: `node plugin/bin/pr-checks.js --run "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/2026-10-19T131646-record-3258"` prints one JSON line with exit 0 (state per PR #3601's live checks). Record the printed line in the task report.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/pr-checks.js tests/bin-lib/pr-checks/cli.test.js docs/plugin-structure.md
git commit -m "Read the integration tip in pr-checks.js on red — report inherited-red when every failing check is already red at base" -m "refs #3258" -m "Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD"
```

---

### Task 3: Route inherited-red in the shared gate and its callers

**Files:**
- Modify: `plugin/skills/_shared/pr-check-gate.md` (4,780 bytes; shared ceiling 51,200 — ample headroom)
- Modify: `plugin/skills/test/SKILL.md:75` (22,976 bytes) — the PR-check gate bullet
- Modify: `plugin/skills/review/code-mode-steps.md:102` (42,330 bytes; ~8.8 KB headroom) — the `red` STOP row's action text only; keep the row's leading `| \`pr-checks.js\` reports \`red\`` cell byte-identical (pinned by `tests/pr-check-gate-conformance.test.js`), and leave line 101 untouched (pinned by `tests/review-step1-5-verifiedhead-gate.test.js`)
- Test: `tests/pr-check-gate-conformance.test.js` (append)

**Interfaces:**
- Consumes: the `pr-checks.js` output contract from Task 2 (`state: 'inherited-red'`, `baseSha`, `baseReason`, per-entry `inherited`), and its `USAGE` text (`state: red | inherited-red | …`).
- Consumer classification (every reader of `pr-checks.js`'s `state`): `_shared/pr-check-gate.md` (router — gains the bullet); `test/SKILL.md` lines 75 and 200 (75 enumerates states → update; 200 only says "a `red` result means do not set it" → unchanged, correct since `inherited-red` is not `red`); `review/code-mode-steps.md` line 67 ("proceed … unless it is `red`" → unchanged, correct) and the gate table lines 101-102 (101 "not `red`" → unchanged; 102 action names the cause → update to attributable-only).

- [ ] **Step 1: Write the failing tests** (append to `tests/pr-check-gate-conformance.test.js`)

```js
const PR_CHECKS = read('plugin/bin/pr-checks.js');

test('AC1.1: inherited-red passes with a caveat and an AUTO line naming the base sha and checks', () => {
  const b = section(GATE, /\*\*`inherited-red`\*\*/, /\n- \*\*/);
  assert.match(b, /caveat/i);
  assert.match(b, /--status AUTO/);
  assert.ok(b.includes('{baseSha short}'), 'AUTO text names the base sha');
  assert.match(b, /`TEST_PASSED` is set/);
});

test('AC2.1: red names only checks not flagged inherited as the cause', () => {
  const red = section(GATE, /\*\*`red`\*\*/, /\n- \*\*/);
  assert.match(red, /`inherited`/);
  assert.match(red, /attributable/i);
  assert.ok(!red.includes('separate follow-up record'), 'stale deferral note removed');
});

test('AC3.1: the gate states an unreadable base stays red, never green', () => {
  assert.match(GATE, /`baseReason`/);
  assert.match(GATE, /stays `red`/);
});

test('every state pr-checks.js can print is routed by a bullet in the gate (code twin)', () => {
  const m = PR_CHECKS.match(/'  state: ([^'\\]+)\\n'/);
  assert.ok(m, 'USAGE state line found');
  const states = m[1].split('|').map((s) => s.trim()).filter(Boolean);
  assert.ok(states.includes('inherited-red'));
  const routing = section(GATE, /## Routing by `state`/, /\n## /);
  for (const s of states) assert.ok(routing.includes(`\`${s}\``), `gate routes ${s}`);
});

test('/test names inherited-red in its PR-check gate bullet', () => {
  const pb = section(TEST_SKILL, /\*\*Pipeline behavior:\*\*/, /\n## /);
  assert.ok(pb.includes('`inherited-red`'), 'test/SKILL.md Pipeline behavior names inherited-red');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pr-check-gate-conformance.test.js`
Expected: FAIL — `section start /\*\*`inherited-red`\*\*/ not found`.

- [ ] **Step 3: Edit the prose**

`_shared/pr-check-gate.md`:
- The "When it runs" output line becomes `{state, failing, pending, headRefOid, localHead, pr, reason?, baseSha?, baseReason?}`.
- Classification-authority paragraph gains: on a `red` read the reader also reads the integration branch tip (`_shared/integration-branch.md` via the shared resolver) — its check runs, commit statuses and workflow runs — and flags each `failing[]` entry `inherited: true` when a check of the same name is failing there, `false` (attributable) otherwise; when every failing entry is inherited the state is `inherited-red`; when the base cannot be read the state stays `red` with `baseReason` and no `inherited` flags (never green) (#3258).
- `red` bullet: the card's finding names only `failing[]` entries not flagged `inherited` (the attributable checks) as the cause; any `inherited: true` entries are listed after them as "also failing on {integration-branch} at {baseSha short} — inherited, catch up rather than debug the diff"; with `baseReason` present, every failing check is treated as attributable and the card says the base comparison could not run (`{baseReason}`). Remove the "(code-side base-check comparison is a separate follow-up record)" parenthetical.
- New bullet after `red`: **`inherited-red`** — pass, with a caveat: `TEST_PASSED` is set and carries the caveat; `/review` Step 1.5 proceeds. Log one entry: `node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO --section "{/test|/review}" --step "PR-check gate" --reversibility high --text "PR #{pr} checks red at {headRefOid short}, but every failing check ({names}) is also failing on {integration-branch} at {baseSha short} — inherited, passed with caveat"`. One sentence: the merge gate (`_shared/pr-first-merge.md` Step 2.5) keeps its own read and still sees these checks red — this pass never authorizes a merge.

`test/SKILL.md:75`: after "`pending`/`stale` pass with a caveat;" insert "`inherited-red` (every failing check is also failing at the integration tip) passes with a caveat naming the base sha and checks;".

`review/code-mode-steps.md:102`: action becomes "**STOP** — name each failing check not flagged `inherited` (the attributable ones) and its URL; fix forward and re-run `/claude-tweaks:test`".

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/pr-check-gate-conformance.test.js tests/review-step1-5-verifiedhead-gate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pr-check-gate.md plugin/skills/test/SKILL.md plugin/skills/review/code-mode-steps.md tests/pr-check-gate-conformance.test.js
git commit -m "Route inherited-red in the PR-check gate — caveat when every red check is already red on the integration tip" -m "refs #3258" -m "Claude-Session: https://claude.ai/code/session_014jZCLvzHYqSD85nVGenWvD"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Deliverable: `bin/pr-checks.js` reads base tip on red, inherited/attributable per check | Task 2 |
| Deliverable: `classify.js` pure partition helper + `inherited-red` state / per-entry flag | Task 1 (both the state and the flag) |
| Deliverable: `_shared/pr-check-gate.md` all-inherited → caveat AUTO line; mixed fails on attributable only | Task 3 |
| Deliverable: tests for all-inherited, mixed, base-read-failed | Tasks 1-2 (AC1.1/AC2.1/AC3.1 tests in both suites) |
| AC1.1 | Task 1 `AC1.1:` test, Task 2 `AC1.1:` test, Task 3 `AC1.1:` test |
| AC2.1 | Task 1 `AC2.1:` test, Task 2 `AC2.1:` test, Task 3 `AC2.1:` test |
| AC3.1 | Task 1 `AC3.1:` test, Task 2 `AC3.1:` test, Task 3 `AC3.1:` test |
