// tests/verify-run-bookends.test.js
// Fake deps per the gh-api-module-pattern skill's injectable-runner
// convention — never real git or the filesystem. `readClaimBlobGit` fakes
// return the same shape claims-git-cas.js's real implementation does
// ({content, tipSha, absent, failure}).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  run, parseArgs, parseTargets, USAGE, realDeps,
} = require('../plugin/bin/verify-run-bookends');

const canonicalClaim = (n) => `## /flow\n- AUTO 09:41:32 — Step 2.8: claimed #${n} (bin/claim-targets.js, transport: git). Reversibility: high.\n`;

const RUN_DIR = '/repo/.claude-tweaks/pipelines/2026-09-17T001731-record-1728';
const RUN_ID = '2026-09-17T001731-record-1728';
const NOW = Date.parse('2026-09-17T01:00:00.000Z');

function liveMarker(runId, claimedAtIso = new Date(NOW).toISOString(), ttlHours = 72) {
  return JSON.stringify({
    runId, sessionId: 's', claimedAt: claimedAtIso, ttlHours, host: 'h',
  });
}
function tombstoneMarker(runId) {
  return JSON.stringify({ released: true, runId, reason: 'x', releasedAt: new Date(NOW).toISOString() });
}

function makeDeps({
  runState = { worktree: '/wt', pr: { number: 1, url: 'https://x' } },
  integrationModel = 'pr-first',
  claims = {},
  isSpecCommitted = () => true,
  readDecisions = () => `${canonicalClaim(1728)}${canonicalClaim(1729)}`,
} = {}) {
  return {
    readRunState: () => runState,
    readIntegrationModel: () => integrationModel,
    isSpecCommitted,
    readDecisions,
    readClaimBlobGit: ({ issueNumber }) => claims[issueNumber] || { content: null, absent: true, failure: null },
    now: () => NOW,
    stdout: () => {},
    stderr: () => {},
  };
}

function captured(deps) {
  const out = [];
  const err = [];
  return {
    ...deps,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    out,
    err,
  };
}

test('parseArgs: rejects an unknown flag', () => {
  assert.deepStrictEqual(parseArgs(['--bogus']), { error: 'unknown argument: --bogus' });
});

test('parseTargets: rejects blank, trailing comma, and non-positive-integer parts', () => {
  assert.strictEqual(parseTargets(''), null);
  assert.strictEqual(parseTargets('1,'), null);
  assert.strictEqual(parseTargets('0'), null);
});

test('parseTargets: accepts a clean comma-separated list', () => {
  assert.deepStrictEqual(parseTargets('1,2,3'), [1, 2, 3]);
});

test('--help prints usage and exits 0', () => {
  const deps = captured(makeDeps());
  const code = run(['--help'], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.out[0], USAGE);
});

test('missing --run exits 2', () => {
  const deps = captured(makeDeps());
  const code = run(['--targets', '1728'], deps);
  assert.strictEqual(code, 2);
});

test('missing --targets exits 2', () => {
  const deps = captured(makeDeps());
  const code = run(['--run', RUN_DIR], deps);
  assert.strictEqual(code, 2);
});

test('all bookends confirmed (worktree stamped, PR recorded under pr-first, live claim matching this run) -> exit 0', () => {
  const deps = captured(makeDeps({
    claims: { 1728: { content: liveMarker(RUN_ID), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 0);
  const payload = JSON.parse(deps.out[0]);
  assert.strictEqual(payload.ok, true);
  assert.deepStrictEqual(payload.confirmed.claims, [1728]);
});

test('a stale claim still counts as confirmed when the runId matches this run (TTL expiry is not "never claimed")', () => {
  const staleClaimedAt = new Date(NOW - 100 * 60 * 60 * 1000).toISOString(); // 100h ago, past the 72h TTL
  const deps = captured(makeDeps({
    claims: { 1728: { content: liveMarker(RUN_ID, staleClaimedAt), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 0);
});

test('no run-state.json (worktree never recorded) -> exit 1, missing worktree bookend', () => {
  const deps = captured(makeDeps({
    runState: null,
    claims: { 1728: { content: liveMarker(RUN_ID), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  assert.strictEqual(payload.ok, false);
  assert.ok(payload.missing.some((m) => m.bookend === 'worktree'));
});

test('pr-first with no PR recorded -> exit 1, missing pr bookend', () => {
  const deps = captured(makeDeps({
    runState: { worktree: '/wt' },
    claims: { 1728: { content: liveMarker(RUN_ID), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  assert.ok(payload.missing.some((m) => m.bookend === 'pr'));
});

test('local-merge run with no PR recorded -> the pr bookend is not required', () => {
  const deps = captured(makeDeps({
    runState: { worktree: '/wt' },
    integrationModel: 'local-merge',
    claims: { 1728: { content: liveMarker(RUN_ID), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 0);
  const payload = JSON.parse(deps.out[0]);
  assert.strictEqual(payload.confirmed.pr, 'n/a');
});

test('claim never written (absent) -> exit 1, missing claim bookend', () => {
  const deps = captured(makeDeps({ claims: {} }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  const claimMiss = payload.missing.find((m) => m.bookend === 'claim' && m.issue === 1728);
  assert.ok(claimMiss, 'absent claim must be reported missing');
  assert.match(claimMiss.reason, /state=absent/);
});

test('claim held by a DIFFERENT run -> exit 1, not silently accepted as this run\'s own', () => {
  const deps = captured(makeDeps({
    claims: { 1728: { content: liveMarker('some-other-run'), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  const claimMiss = payload.missing.find((m) => m.bookend === 'claim' && m.issue === 1728);
  assert.match(claimMiss.reason, /runId=some-other-run/);
});

test('a tombstoned (released) claim does not count as confirmed', () => {
  const deps = captured(makeDeps({
    claims: { 1728: { content: tombstoneMarker(RUN_ID), absent: false, failure: null } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
});

test('a git read failure surfaces as a distinct reason, never mistaken for "never claimed"', () => {
  const deps = captured(makeDeps({
    claims: { 1728: { content: null, absent: false, failure: 'transport-failure' } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  const claimMiss = payload.missing.find((m) => m.bookend === 'claim' && m.issue === 1728);
  assert.match(claimMiss.reason, /read-failed: transport-failure/);
});

// #3051: a timed-out git read names the timeout specifically — "remote
// slow" is a different, more actionable signal than "remote unreachable".
test('a git read failure with timedOut set names the timeout in the missing-bookend reason', () => {
  const deps = captured(makeDeps({
    claims: { 1728: { content: null, absent: false, failure: 'transport-failure', timedOut: true } },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  const claimMiss = payload.missing.find((m) => m.bookend === 'claim' && m.issue === 1728);
  assert.match(claimMiss.reason, /read-failed: transport-failure \(timed out after \d+ ms\)/);
});

test('multiple targets: every one is checked independently, all confirmed -> exit 0', () => {
  const deps = captured(makeDeps({
    claims: {
      1728: { content: liveMarker(RUN_ID), absent: false, failure: null },
      1729: { content: liveMarker(RUN_ID), absent: false, failure: null },
    },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728,1729'], deps);
  assert.strictEqual(code, 0);
});

test('multiple targets: one unconfirmed target is reported without masking the confirmed one', () => {
  const deps = captured(makeDeps({
    claims: {
      1728: { content: liveMarker(RUN_ID), absent: false, failure: null },
      1729: { content: null, absent: true, failure: null },
    },
  }));
  const code = run(['--run', RUN_DIR, '--targets', '1728,1729'], deps);
  assert.strictEqual(code, 1);
  const payload = JSON.parse(deps.out[0]);
  assert.strictEqual(payload.missing.length, 1);
  assert.strictEqual(payload.missing[0].issue, 1729);
});

const OWN_CLAIM = { 1728: { content: liveMarker(RUN_ID), absent: false, failure: null } };

test('AC1.1: a target whose spec is not committed -> exit 1, missing materialize bookend with a materialize.js remedy', () => {
  const deps = captured(makeDeps({ claims: OWN_CLAIM, isSpecCommitted: () => false }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  const m = JSON.parse(deps.out[0]).missing.find((x) => x.bookend === 'materialize' && x.issue === 1728);
  assert.ok(m, 'materialize bookend missing');
  assert.strictEqual(m.reason, 'not-committed');
  assert.match(m.remedy, /materialize\.js" 1728/);
});

test('isSpecCommitted returning null -> missing materialize with reason "undetermined"', () => {
  const deps = captured(makeDeps({ claims: OWN_CLAIM, isSpecCommitted: () => null }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  const m = JSON.parse(deps.out[0]).missing.find((x) => x.bookend === 'materialize');
  assert.strictEqual(m.reason, 'undetermined');
});

test('AC1.1: realDeps.isSpecCommitted is true only for a spec committed at HEAD', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookends-spec-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: root, stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(root, 'README.md'), 'x\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'init');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', RUN_ID);
  const specRel = `.claude-tweaks/pipelines/${RUN_ID}/work/1728-spec.md`;
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(root, specRel), 'spec\n');
  const args = { runDir, worktree: root, issue: 1728 };
  assert.strictEqual(realDeps.isSpecCommitted(args), false, 'untracked');
  git('add', specRel);
  assert.strictEqual(realDeps.isSpecCommitted(args), false, 'staged but not committed');
  git('commit', '-q', '-m', 'spec');
  assert.strictEqual(realDeps.isSpecCommitted(args), true, 'committed');
  assert.strictEqual(realDeps.isSpecCommitted({ ...args, issue: 1729 }), false, 'other record');

  const specRunDir = path.join(runDir, 'spec-1730');
  const nestedRel = `.claude-tweaks/pipelines/${RUN_ID}/spec-1730/work/1730-spec.md`;
  fs.mkdirSync(path.join(specRunDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(root, nestedRel), 'spec\n');
  git('add', nestedRel);
  git('commit', '-q', '-m', 'nested spec');
  assert.strictEqual(realDeps.isSpecCommitted({ runDir: specRunDir, worktree: root, issue: 1730 }), true, 'spec-N run dir');
  assert.strictEqual(realDeps.isSpecCommitted({ runDir, worktree: root, issue: 1730 }), true, 'nested spec found from the parent run id');
});

test('realDeps.isSpecCommitted -> null when the worktree is unresolvable', () => {
  assert.strictEqual(realDeps.isSpecCommitted({ runDir: RUN_DIR, worktree: path.join(os.tmpdir(), 'bookends-no-such-dir-2912'), issue: 1728 }), null);
  assert.strictEqual(realDeps.isSpecCommitted({ runDir: RUN_DIR, worktree: undefined, issue: 1728 }), null);
});

test('AC3.1: a paraphrased claim line -> exit 1, missing claim-log bookend whose remedy is the canonical log-decision.js command', () => {
  const deps = captured(makeDeps({
    claims: OWN_CLAIM,
    readDecisions: () => '- AUTO 09:00:00 — Step 2.8: claimed issue #1728. Reversibility: high.',
  }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  const m = JSON.parse(deps.out[0]).missing.find((x) => x.bookend === 'claim-log' && x.issue === 1728);
  assert.ok(m, 'claim-log bookend missing');
  assert.match(m.remedy, /--step "Step 2\.8"/);
  assert.match(m.remedy, /claimed #1728 \(bin\/claim-targets\.js/);
});

test('unreadable decisions.md (null) -> missing claim-log, not a crash', () => {
  const deps = captured(makeDeps({ claims: OWN_CLAIM, readDecisions: () => null }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  assert.ok(JSON.parse(deps.out[0]).missing.some((x) => x.bookend === 'claim-log' && x.issue === 1728));
});

test('every missing entry carries a remedy string', () => {
  const deps = captured(makeDeps({
    runState: null, claims: {}, isSpecCommitted: () => false, readDecisions: () => '',
  }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  const { missing } = JSON.parse(deps.out[0]);
  assert.deepStrictEqual(missing.map((m) => m.bookend).sort(), ['claim', 'claim-log', 'materialize', 'pr', 'worktree']);
  for (const m of missing) assert.strictEqual(typeof m.remedy, 'string', m.bookend);
});

test('all bookends confirmed -> payload.confirmed.materialize and .claimLog list the targets', () => {
  const deps = captured(makeDeps({
    claims: {
      1728: { content: liveMarker(RUN_ID), absent: false, failure: null },
      1729: { content: liveMarker(RUN_ID), absent: false, failure: null },
    },
  }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728,1729'], deps), 0);
  const { confirmed } = JSON.parse(deps.out[0]);
  assert.deepStrictEqual(confirmed.materialize, [1728, 1729]);
  assert.deepStrictEqual(confirmed.claimLog, [1728, 1729]);
});

test('AC4.1: a run in this record\'s own pre-fix shape (pr-first, no PR, paraphrased claim, uncommitted spec) exits 1 naming pr, materialize and claim-log', () => {
  const deps = captured(makeDeps({
    runState: { worktree: '/wt' },
    integrationModel: 'pr-first',
    claims: OWN_CLAIM,
    isSpecCommitted: () => false,
    readDecisions: () => '- AUTO 09:00:00 — Step 2.8: claimed issue #1728. Reversibility: high.',
  }));
  assert.strictEqual(run(['--run', RUN_DIR, '--targets', '1728'], deps), 1);
  const names = JSON.parse(deps.out[0]).missing.map((m) => m.bookend);
  for (const b of ['pr', 'materialize', 'claim-log']) assert.ok(names.includes(b), b);
});

test('realDeps.readDecisions reads decisions.md and returns null when absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookends-dec-'));
  assert.strictEqual(realDeps.readDecisions(dir), null);
  fs.writeFileSync(path.join(dir, 'decisions.md'), 'hello\n');
  assert.strictEqual(realDeps.readDecisions(dir), 'hello\n');
});
