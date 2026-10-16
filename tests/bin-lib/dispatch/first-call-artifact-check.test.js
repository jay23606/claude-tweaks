'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkFirstCallArtifacts } = require('../../../plugin/bin/lib/dispatch/first-call-artifact-check');
const { claimFilePath } = require('../../../plugin/bin/lib/issues/claims');

const REPO_SLUG = 'acme/widgets';
const RUN_ID = '2026-09-29T154722-record-2806';
const NOW = Date.parse('2026-09-29T16:00:00Z');

function mkRunDir() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-first-call-check-'));
  return path.join(parent, RUN_ID);
}

function writeRunDir(runDir, { runState, config }) {
  fs.mkdirSync(runDir, { recursive: true });
  if (runState !== undefined) fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(runState));
  if (config !== undefined) fs.writeFileSync(path.join(runDir, 'config.yml'), config);
}

function liveClaimContent(runId) {
  return JSON.stringify({
    runId, sessionId: 's1', claimedAt: new Date(NOW).toISOString(), ttlHours: 72, host: 'h',
  });
}

// Fake ghApi mirrors claim-store.test.js's own shape: non-throwing, branches on the
// exact contents-API read args readClaimBlobContentsApi issues, throws on anything
// else so a wrong endpoint fails the test loudly rather than silently passing.
function fakeGhApi(claimsByIssue) {
  return (args) => {
    for (const [issueNumber, content] of Object.entries(claimsByIssue)) {
      const expected = `repos/${REPO_SLUG}/contents/${claimFilePath(issueNumber)}?ref=claims-registry`;
      if (args[0] === expected) {
        if (content === null) return { stdout: null, failure: null, status: 404 };
        return { stdout: JSON.stringify({ content, sha: 'deadbeef' }), failure: null, status: null };
      }
    }
    throw new Error(`unexpected gh api call: ${args.join(' ')}`);
  };
}

function fakeGitRunner(pushedBranches) {
  return (args) => {
    assert.deepEqual(args.slice(0, 3), ['ls-remote', '--heads', 'origin'], `unexpected git call: ${args.join(' ')}`);
    const branch = args[3];
    return pushedBranches.includes(branch) ? `abc123\trefs/heads/${branch}\n` : '';
  };
}

test('fully-formed pr-first run passes: claim live under this run, PR recorded and branch pushed', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
    config: 'integration-model: pr-first\nautonomy: trusted\n',
  });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner(['worktree-2806']),
    now: NOW,
  });
  assert.deepEqual(result, { ok: true });
});

test('fails with a distinct reason when run-state.json is missing', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { config: 'integration-model: local-merge\n' });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-run-state');
});

test('fails with a distinct reason when config.yml is missing', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
});

test('fails with a distinct reason when the claim is absent (#2806 attempt-1 symptom)', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {}, config: 'integration-model: local-merge\n' });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: null }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'claim-absent');
});

test('fails with a distinct reason when the claim is live under a different runId', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {}, config: 'integration-model: local-merge\n' });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent('some-other-run-id') }),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'claim-run-id-mismatch');
  assert.match(result.message, /some-other-run-id/);
});

test('fails with a distinct reason under pr-first when run-state.json records no PR', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {}, config: 'integration-model: pr-first\n' });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'pr-missing');
});

test('fails with a distinct reason under pr-first when the recorded PR\'s head branch is unpushed', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
    config: 'integration-model: pr-first\n',
  });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner([]), // nothing pushed to origin
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'pr-branch-unpushed');
});

// #3226: `repairable` classification on `missing-config`. `config.yml` is never
// written in any of these fixtures (writeRunDir's `config` stays undefined), so
// every one of these hits the `missing-config` path; `integration-model` is
// resolved from policy.yml alone (no config.yml to read) via a `readFile` fake
// that intercepts only the `.claude-tweaks/policy.yml` path and forwards every
// other path (run-state.json) to the real filesystem, so writeRunDir's real
// files are still read normally.
function fakeReadFileWithPolicy(policyRaw) {
  return (p) => {
    if (p.endsWith(path.join('.claude-tweaks', 'policy.yml'))) {
      if (policyRaw instanceof Error) throw policyRaw;
      if (policyRaw === null) {
        const err = new Error('ENOENT: no such file or directory');
        err.code = 'ENOENT';
        throw err;
      }
      return policyRaw;
    }
    return fs.readFileSync(p, 'utf8');
  };
}

// fakeGitRunner's own assert only tolerates an `ls-remote --heads origin …`
// call shape — resolvePolicyConfig's internal `git(['rev-parse', '--show-
// toplevel'])` probe would trip that assert. Reusing the SAME fake is still
// safe: resolvePolicyConfig wraps its own `git()` call in a try/catch and
// falls back to `process.cwd()` on any failure (including an assertion
// thrown from inside the fake), so the mismatched call never escapes as a
// test failure — confirmed by AC1/AC3/AC5 below all resolving correctly
// despite reusing `fakeGitRunner`.

test('#3226 AC1: missing-config + claim live and matching runId + (pr-first) PR recorded and pushed -> repairable: true', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
  }); // no config key -> config.yml never written
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner(['worktree-2806']),
    readFile: fakeReadFileWithPolicy('integration-model: pr-first\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, true);
});

test('#3226 AC2: missing-config + claim absent -> repairable: false', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: null }),
    readFile: fakeReadFileWithPolicy('integration-model: pr-first\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC2 variant: missing-config + claim live under a different runId -> repairable: false', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent('some-other-run-id') }),
    readFile: fakeReadFileWithPolicy('integration-model: pr-first\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC3: missing-config + claim live/matching, but (pr-first) PR unpushed -> repairable: false', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
  });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner([]), // nothing pushed to origin
    readFile: fakeReadFileWithPolicy('integration-model: pr-first\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC3 variant: missing-config + claim live/matching, but (pr-first) PR unrecorded -> repairable: false', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    readFile: fakeReadFileWithPolicy('integration-model: pr-first\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC4: missing-config + a policy read that THROWS (not ENOENT) -> repairable: false, never repairs on missing evidence', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
  });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner(['worktree-2806']),
    readFile: fakeReadFileWithPolicy(new Error('EACCES: permission denied')),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC4 variant: missing-config + policy.yml resolving integration-model as invalid -> repairable: false', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, {
    runState: { pr: { number: 42, url: 'https://github.com/acme/widgets/pull/42', branch: 'worktree-2806' } },
  });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    gitRunner: fakeGitRunner(['worktree-2806']),
    readFile: fakeReadFileWithPolicy('integration-model: not-a-real-value\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, false);
});

test('#3226 AC5: missing-config + claim live/matching, under a non-pr-first integration-model -> repairable: true from claim checks alone, PR checks skipped', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} }); // no PR recorded at all -- must not matter
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    readFile: fakeReadFileWithPolicy('integration-model: local-merge\n'),
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, true);
});

test('#3226 AC5 variant: missing-config + claim live/matching, with NO policy.yml at all (default/null value) -> repairable: true, PR checks skipped', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { runState: {} });
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({ 2806: liveClaimContent(RUN_ID) }),
    readFile: fakeReadFileWithPolicy(null), // ENOENT -> integration-model resolves to its unset default (null)
    now: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-config');
  assert.equal(result.repairable, true);
});

test('#3226 AC6: every non-missing-config failure reason carries no repairable field at all', () => {
  const runDir = mkRunDir();
  writeRunDir(runDir, { config: 'integration-model: local-merge\n' }); // run-state.json missing
  const result = checkFirstCallArtifacts({ runDir, issueNumbers: [2806], repoSlug: REPO_SLUG }, {
    ghApi: fakeGhApi({}),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-run-state');
  assert.equal('repairable' in result, false, 'repairable must be absent, not merely false, for a non-missing-config reason');
});
