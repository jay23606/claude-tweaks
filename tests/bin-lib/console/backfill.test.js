// tests/bin-lib/console/backfill.test.js — the Review Console backlog backfill's
// work list (#3950): which closed runs are walked (acknowledged consoles
// included), how a legacy decisions.md line splits into one item per finding,
// and the content-derived ids the apply step joins on.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  STAGED_FINDING_RE, enumerateRuns, splitDecisionLine, backfillItemId, itemHashOf, buildWorkList, summarize,
} = require('../../../plugin/bin/lib/console/backfill');
const { closeRunState } = require('../../../plugin/bin/lib/hooks/close-run-state');
const { writeRunState } = require('../../../plugin/bin/lib/hooks/context');
const { scanUnresolvedConsoles } = require('../../../plugin/bin/lib/hooks/session-residue');
const { runIdOf } = require('../../../plugin/bin/lib/console/resolve');

const MAIN_SHA = '0123456789abcdef0123456789abcdef01234567';

// A git-initialised root, so wtDetect.mainCheckoutRoot resolves to the fixture.
function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-backfill-'));
  execFileSync('git', ['init', '-q', root]);
  const pipelines = path.join(root, '.claude-tweaks', 'pipelines');
  fs.mkdirSync(pipelines, { recursive: true });
  return { root, pipelines };
}

// A closed run: run-state.json written by the real close-run writer.
function mkClosedRun(pipelines, name) {
  const dir = path.join(pipelines, name);
  fs.mkdirSync(dir, { recursive: true });
  const r = closeRunState(dir, { explicit: true });
  assert.strictEqual(r.status, 'closed');
  return dir;
}
function mkLiveRun(pipelines, name) {
  const dir = path.join(pipelines, name);
  fs.mkdirSync(dir, { recursive: true });
  writeRunState(dir, { status: 'active' });
  return dir;
}
function mkArchived(pipelines, name) {
  const dir = path.join(pipelines, 'archive', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function mkConsole(dir, items, extra = {}) {
  fs.writeFileSync(path.join(dir, 'console.json'), JSON.stringify({ resolved: true, items, ...extra }));
}
function mkDecisions(dir, lines) {
  fs.writeFileSync(path.join(dir, 'decisions.md'), `# Decisions\n\n${lines.join('\n')}\n`);
}
function mkStaged(dir, name, text) {
  fs.mkdirSync(path.join(dir, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'staged', name), text);
}

const sha8 = (line) => crypto.createHash('sha256').update(line).digest('hex').slice(0, 8);
const newId = (line) => `decision:${line.slice(2, 60)}#${sha8(line)}`;
const oldId = (line) => `decision:${line.slice(2, 60)}`;
const LOW = 'Low-confidence findings';
const KEEP = (id, section = LOW) => ({ id, section, resolution: 'keep-staged', reason: 'unconfirmed finding — never auto-applied' });
const PENDING = (id) => ({ id, section: 'Pending review', resolution: 'pending', reason: 'unmapped-prefix' });

// Real lines (archive/2026-10-16T162759-record-3013, and the #3772 resolve.js line).
const BUNDLED = '- STAGED 19:29:13 — Step 3 reproduction: lens 3f findings not reproduced (single agent): classify.test.js:81 tests normalizeEntry directly (internal coupling); pr-check-gate-conformance.test.js:77 prose-regex extraction called brittle (note: deepEqual against FAILING_CONCLUSIONS fails loudly on an empty extraction). Staged to Review Console as low-confidence. Reversibility: high.';
const CLAIMLESS = '- STAGED 14:54:55 — log-decision: Reproduction: lens "3c" finding plugin/bin/lib/console/resolve.js:134 not reproduced (present in only one of two reproduction agents). Staged to Review Console as low-confidence. Reversibility: high.';
const SINGLE = '- STAGED 10:00:00 — Reproduction: lens "3c" finding plugin/bin/lib/console/residue.js:40 not reproduced (single agent): the missing split ignores ids that carry a slash. Staged to Review Console as low-confidence. Reversibility: high.';
const REPEATED_LOC = '- STAGED 11:02:03 — Reproduction: lens "3b" findings plugin/bin/compose-subject.js:454 the type lookup ignores a scoped type label / plugin/bin/compose-subject.js:454 the subject truncation drops the trailing record reference share a location. Staged to Review Console as low-confidence. Reversibility: high.';

test('AC2.1: an acknowledged console holding keep-staged items is walked', () => {
  const { pipelines } = fixtureRoot();
  const run = mkClosedRun(pipelines, '2026-10-20T100000-spec-1');
  mkDecisions(run, [SINGLE]);
  mkConsole(run, [KEEP(newId(SINGLE))], { residueAcknowledgedAt: '2026-10-21T00:00:00.000Z' });
  const wl = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA });
  assert.strictEqual(wl.mainSha, MAIN_SHA);
  assert.strictEqual(wl.runs[0].runDir, run);
  assert.strictEqual(wl.runs[0].items.length, 1);
});

test('AC2.2: scanUnresolvedConsoles skips that same console', () => {
  const { root, pipelines } = fixtureRoot();
  const run = mkClosedRun(pipelines, '2026-10-20T100000-spec-1');
  mkDecisions(run, [SINGLE]);
  mkConsole(run, [KEEP(newId(SINGLE))]);
  assert.strictEqual(scanUnresolvedConsoles(root, { limit: Infinity, window: Infinity }).runs.length, 1, 'precondition: the scan resolves to this fixture');
  mkConsole(run, [KEEP(newId(SINGLE))], { residueAcknowledgedAt: '2026-10-21T00:00:00.000Z' });
  assert.strictEqual(scanUnresolvedConsoles(root, { limit: Infinity, window: Infinity }).runs.length, 0);
  assert.strictEqual(buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0].items.length, 1);
});

test('AC3.1: a bundled line yields one work item per finding', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T162759-record-3013');
  mkDecisions(run, [BUNDLED]);
  mkConsole(run, [KEEP(newId(BUNDLED))]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.deepStrictEqual(items.map((i) => i.kind), ['finding', 'finding']);
  assert.deepStrictEqual(items.map((i) => i.finding.path), ['classify.test.js', 'pr-check-gate-conformance.test.js']);
  assert.deepStrictEqual(items.map((i) => i.finding.line), [81, 77]);
  assert.deepStrictEqual(items.map((i) => i.finding.lens), ['3f', '3f']);
  assert.notStrictEqual(items[0].itemId, items[1].itemId);
  assert.match(items[0].itemId, /^bf:[0-9a-f]{16}$/);
  assert.strictEqual(items[0].bundleLine, BUNDLED);
  assert.match(items[0].claimText, /tests normalizeEntry directly/);
});

test('AC3.2: two lines sharing their first 58 characters yield distinct ids', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T000000-spec-2');
  const a = '- STAGED 10:00:00 — Reproduction: lens "3c" finding plugin/bin/lib/console/alpha.js:10 not reproduced (single agent): the alpha reader drops a trailing newline. Staged to Review Console as low-confidence.';
  const b = '- STAGED 10:00:00 — Reproduction: lens "3c" finding plugin/bin/lib/console/beta.js:20 not reproduced (single agent): the beta writer skips its atomic rename step. Staged to Review Console as low-confidence.';
  assert.strictEqual(a.slice(2, 60), b.slice(2, 60), 'precondition: one old-shape id covers both lines');
  mkDecisions(run, [a, b]);
  mkConsole(run, [KEEP(oldId(a)), KEEP(oldId(b))]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.strictEqual(items.length, 2);
  assert.notStrictEqual(items[0].itemId, items[1].itemId);
});

test('AC3.2b: a repeated location in one line yields distinct ids', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T000000-spec-3');
  mkDecisions(run, [REPEATED_LOC]);
  mkConsole(run, [KEEP(newId(REPEATED_LOC))]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items.map((i) => `${i.finding.path}:${i.finding.line}`), ['plugin/bin/compose-subject.js:454', 'plugin/bin/compose-subject.js:454']);
  assert.notStrictEqual(items[0].itemId, items[1].itemId);
});

test('AC4.1: a finding with no recoverable claim is a no-claim item', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-19T000000-spec-4');
  mkDecisions(run, [CLAIMLESS]);
  mkConsole(run, [KEEP(newId(CLAIMLESS))]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].kind, 'no-claim');
  assert.strictEqual(items[0].noClaimReason, 'claim-empty');
  assert.deepStrictEqual(splitDecisionLine(CLAIMLESS), { findings: [], noClaim: 'claim-empty' });
});

test('no-claim reasons are distinguishable', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-19T000000-spec-5');
  const noPath = '- STAGED 10:00:00 — Reproduction: lens "3c" finding in the console template not reproduced (single agent): the merge row omits its reason column entirely. Staged to Review Console as low-confidence.';
  mkDecisions(run, [noPath]);
  mkConsole(run, [KEEP(newId(noPath)), KEEP('decision:STAGED 09:00:00 — no such line was ever logged here at all'), PENDING('review-unconfirmed-9.md')]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.deepStrictEqual(items.map((i) => [i.kind, i.noClaimReason]), [
    ['no-claim', 'no-path'], ['no-claim', 'source-line-not-found'], ['no-claim', 'staged-file-absent'],
  ]);
});

test('work items: a duplicated old-shape id group becomes one bundle', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T000000-spec-6');
  const a = '- STAGED 10:00:00 — Reproduction: lens "3c" finding plugin/bin/lib/console/alpha.js:10 not reproduced (single agent): the alpha reader drops a trailing newline. Staged to Review Console as low-confidence.';
  const b = '- STAGED 10:00:00 — Reproduction: lens "3c" finding plugin/bin/lib/console/beta.js:20 not reproduced (single agent): the beta writer skips its atomic rename step. Staged to Review Console as low-confidence.';
  mkDecisions(run, [a, b]);
  mkConsole(run, [KEEP(oldId(a)), KEEP(oldId(a)), KEEP(oldId(a))]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.strictEqual(items.length, 2);
  for (const it of items) assert.deepStrictEqual(it.storedIndices, [0, 1, 2]);
  assert.strictEqual(items[0].itemHash, items[1].itemHash);
  assert.match(items[0].itemHash, /^[0-9a-f]{64}$/);
});

test('ids are deterministic', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T162759-record-3013');
  mkDecisions(run, [BUNDLED, CLAIMLESS]);
  mkStaged(run, 'zz-1.md', 'zz');
  mkConsole(run, [KEEP(newId(BUNDLED)), KEEP(newId(CLAIMLESS)), PENDING('zz-1.md')]);
  const first = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA });
  assert.deepStrictEqual(buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }), first);
  assert.strictEqual(first.runs[0].items[0].itemId, backfillItemId({ runId: runIdOf(run), sourceKey: BUNDLED, findingKey: '3f|classify.test.js:81#0' }));
});

test('staged finding file parses lens, path, line and claim', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-20T000000-spec-3351');
  const text = '# Unconfirmed finding\n\nFinding: no test pins the degraded-field envelope for an empty records list\nSeverity: low\nLens: 3c\nTarget: tests/bin-lib/preflight-records/preflight-records.test.js\n';
  mkStaged(run, 'review-unconfirmed-1.md', text);
  mkConsole(run, [KEEP('review-unconfirmed-1.md')]);
  const [item] = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0].items;
  assert.ok(STAGED_FINDING_RE.test('review-unconfirmed-1.md'));
  assert.strictEqual(item.kind, 'finding');
  assert.deepStrictEqual(item.finding, { lens: '3c', path: 'tests/bin-lib/preflight-records/preflight-records.test.js', line: null, reporterSeverity: 'low', kind: 'unconfirmed' });
  assert.strictEqual(item.claimText, 'no test pins the degraded-field envelope for an empty records list');
  assert.deepStrictEqual(item.storedIndices, [0]);
});

test('staged-kind items carry classifyStagedItem\'s result', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-20T000000-spec-7');
  mkStaged(run, 'reflect-1.md', '**Category:** observation\n\nThe ledger grew.\n');
  mkStaged(run, 'zz-1.md', 'zz\n');
  mkStaged(run, 'x-1.md', 'same bytes\n');
  mkStaged(run, 'x-1.md.shadow-dup', 'same bytes\n');
  mkConsole(run, [PENDING('reflect-1.md'), PENDING('zz-1.md'), PENDING('x-1.md.shadow-dup'), PENDING('docs:CLAUDE.md')]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.deepStrictEqual(items.map((i) => i.kind), ['staged-kind', 'staged-kind', 'staged-kind', 'staged-kind']);
  assert.strictEqual(items[0].staged.reason, 'non-tangential-category:observation');
  assert.strictEqual(items[1].staged.reason, 'unmapped-prefix');
  assert.strictEqual(items[2].staged.outcome, 'shadow-dup-duplicate');
  assert.deepStrictEqual(items[3].staged, { name: 'docs:CLAUDE.md', section: 'Pending review', reason: 'engine-row' });
});

test('a tiebreak: item takes its finding from the verdict line and its claim from review-findings.json', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-22T000000-spec-8');
  const verdict = '- STAGED 12:00:00 — Tiebreak tiebreak:abcdef012345: lens "3c" finding plugin/x.js:12 console: verdict:cant-tell. Severity: high. Recommendation: file.';
  mkDecisions(run, [verdict]);
  fs.writeFileSync(path.join(run, 'review-findings.json'), JSON.stringify([{ id: 'abcdef012345', lens: '3c', path: 'plugin/x.js', line: 12, claim: 'the guard reads a stale value' }]));
  mkConsole(run, [KEEP('tiebreak:abcdef012345'), KEEP('tiebreak:000000000000')]);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.deepStrictEqual(items[0].finding, { lens: '3c', path: 'plugin/x.js', line: 12, reporterSeverity: 'high', kind: 'unconfirmed' });
  assert.strictEqual(items[0].claimText, 'the guard reads a stale value');
  assert.strictEqual(items[1].kind, 'no-claim');
});

test('a bf: item persisted by an earlier apply re-splits to its own finding', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-16T162759-record-3013');
  mkDecisions(run, [BUNDLED]);
  mkConsole(run, [KEEP(newId(BUNDLED))]);
  const [, second] = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0].items;
  const stored = [{ id: 'docs:x', section: 'Documentation updates', resolution: 'approve', reason: 'r' }, { ...KEEP(second.itemId), backfillSource: BUNDLED }];
  mkConsole(run, stored);
  const { items } = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA }).runs[0];
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].itemId, second.itemId);
  assert.strictEqual(items[0].finding.path, 'pr-check-gate-conformance.test.js');
  assert.deepStrictEqual(items[0].storedIndices, [1]);
  assert.strictEqual(items[0].itemHash, itemHashOf([stored[1]]));
});

test('live runs are reported and skipped', () => {
  const { pipelines } = fixtureRoot();
  const run = mkLiveRun(pipelines, '2026-10-23T000000-spec-9');
  mkDecisions(run, [SINGLE]);
  mkConsole(run, [KEEP(newId(SINGLE))]);
  const wl = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA });
  assert.deepStrictEqual(wl.live, [{ runDir: run, status: 'active' }]);
  assert.deepStrictEqual(wl.runs, []);
});

test('an archive twin stands in for a non-clean top-level copy', () => {
  const { pipelines } = fixtureRoot();
  const top = mkLiveRun(pipelines, '2026-10-23T000000-spec-10');
  const twin = mkArchived(pipelines, '2026-10-23T000000-spec-10');
  mkDecisions(twin, [SINGLE]);
  mkConsole(twin, [KEEP(newId(SINGLE))]);
  const wl = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA });
  assert.deepStrictEqual(wl.runs.map((r) => r.runDir), [twin]);
  assert.strictEqual(wl.runs[0].items.length, 1);
  assert.deepStrictEqual(enumerateRuns(pipelines), { closed: [twin], live: [{ runDir: top, status: 'active' }] });
});

test('unreadable console.json emits no items', () => {
  const { pipelines } = fixtureRoot();
  const a = mkArchived(pipelines, '2026-10-01T000000-spec-11');
  const b = mkArchived(pipelines, '2026-10-02T000000-spec-12');
  fs.writeFileSync(path.join(a, 'console.json'), '{not json');
  fs.writeFileSync(path.join(b, 'console.json'), 'null');
  const wl = buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA });
  assert.deepStrictEqual(wl.unreadable.sort(), [path.join(a, 'console.json'), path.join(b, 'console.json')]);
  assert.strictEqual(wl.runs.reduce((n, r) => n + r.items.length, 0), 0);
});

test('summarize counts kinds', () => {
  const { pipelines } = fixtureRoot();
  const run = mkArchived(pipelines, '2026-10-20T000000-spec-13');
  mkDecisions(run, [SINGLE, CLAIMLESS]);
  mkStaged(run, 'zz-1.md', 'zz\n');
  mkConsole(run, [KEEP(newId(SINGLE)), KEEP(newId(CLAIMLESS)), PENDING('zz-1.md'), PENDING('docs:CLAUDE.md'), { id: 'docs:y', section: 'Documentation updates', resolution: 'approve', reason: 'r' }]);
  mkArchived(pipelines, '2026-10-21T000000-spec-14'); // walked, no console
  assert.deepStrictEqual(summarize(buildWorkList({ pipelinesRoot: pipelines, mainSha: MAIN_SHA })), {
    runs: 1, consoles: 1, items: 4, byKind: { finding: 1, 'no-claim': 1, 'staged-kind': 2 }, findingsMaxFiled: 1,
  });
});
