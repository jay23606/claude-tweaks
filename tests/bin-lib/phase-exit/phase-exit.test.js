'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runPhaseExit } = require('../../../plugin/bin/lib/phase-exit/phase-exit');
const { run } = require('../../../plugin/bin/phase-exit');

const RUN_ID = '2026-10-25T000001-record-1';
const BRANCH = 'worktree-dispatch-record-1';
const PR_URL = 'https://github.com/o/r/pull/42';

const created = [];
test.after(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

// Fake-.git anchored fixture, same shape as tests/bin-lib/pr-merge-state/cli.test.js:
// a main checkout's .git is a directory; mainRoot is injected so resolveTarget never spawns git.
function fixture(runState = { worktree: '/wt', pr: { number: 42, url: PR_URL } }, { archived = false } = {}) {
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-phase-exit-'));
  created.push(main);
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  const runDir = archived
    ? path.join(main, '.claude-tweaks', 'pipelines', 'archive', RUN_ID)
    : path.join(main, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  if (runState) fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify(runState));
  return { main, runDir, wt: path.join(main, '.claude', 'worktrees', 'dispatch-record-1') };
}

// Every seam faked. `git` answers by subcommand; a handler value that is an Error is thrown.
function makeDeps(main, wt, opts = {}) {
  const {
    model = 'pr-first', integrationBranch = '', branch = BRANCH, porcelain = '', push = '',
    currentBranch = false, prList = [{ number: 42, url: PR_URL }],
    recordWorktree = 'claude-tweaks: worktree recorded for x\n', recordPr = 'claude-tweaks: PR #42 recorded for x\n',
    checklist = { exit: 0, out: { action: 'written', pr: 42, phase: 'build' } },
    mergeState = { state: 'no-conflict', pr: 42, logged: false },
    ...over
  } = opts;
  const calls = { git: [], gh: [], hooks: [], policy: [], checklist: [], mergeState: [] };
  const out = []; const err = [];
  const gitDir = currentBranch ? '.git' : path.join(main, '.git', 'worktrees', 'dispatch-record-1');
  const answer = (v) => { if (v instanceof Error) throw v; return v; };
  const deps = {
    cwd: () => main,
    mainRoot: main,
    git: (args) => {
      calls.git.push(args);
      assert.equal(args[0], '-C');
      const sub = args.slice(2).join(' ');
      if (sub === 'rev-parse --git-dir --git-common-dir') return `${gitDir}\n${currentBranch ? '.git' : path.join(main, '.git')}\n`;
      if (sub === 'rev-parse HEAD') return 'abc1234def\n';
      if (sub === 'branch --show-current') return `${branch}\n`;
      if (sub === 'symbolic-ref --quiet --short refs/remotes/origin/HEAD') return 'origin/main\n';
      if (sub === '--no-optional-locks status --porcelain -z') return porcelain;
      if (args[2] === 'push') return answer(push);
      throw new Error(`unexpected git ${sub}`);
    },
    gh: (args) => { calls.gh.push(args); return answer(typeof prList === 'string' || prList instanceof Error ? prList : JSON.stringify(prList)); },
    resolvePolicy: (runDir, key) => {
      calls.policy.push(key);
      if (key === 'integration-model') return answer(model);
      if (key === 'integration-branch') return integrationBranch;
      throw new Error(`unexpected key ${key}`);
    },
    hooks: (args) => {
      calls.hooks.push(args);
      return answer(args[0] === 'record-worktree' ? recordWorktree : recordPr);
    },
    prChecklistRun: (argv, d) => {
      calls.checklist.push(argv);
      if (checklist.out) d.stdout(`${JSON.stringify(checklist.out)}\n`);
      return checklist.exit;
    },
    prMergeStateRun: (argv, d) => {
      calls.mergeState.push(argv);
      d.stdout(`${JSON.stringify(mergeState)}\n`);
      return 0;
    },
    now: () => new Date(2026, 9, 25, 12, 0, 0),
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    ...over,
  };
  return { deps, calls, out, err };
}

const opts = (runDir, wt, phase = 'build', extra = {}) => ({ run: runDir, phase, worktree: wt, ...extra });
const entriesOf = (runDir) => {
  const f = path.join(runDir, 'decisions.md');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('- '));
};
const stripTime = (l) => l.replace(/^- (\w[\w-]*) \d{2}:\d{2}:\d{2} — /, '- $1 — ');
const pushCalls = (calls) => calls.git.filter((a) => a[2] === 'push');

// ---- route ----

test('AC2.2: route — local-merge at build logs the SKIP line and calls no git push or gh', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { model: 'local-merge' });
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.route, 'local-merge');
  assert.equal(env.push.state, 'skipped');
  assert.equal(env.checklist, null);
  assert.equal(env.mergeState, null);
  assert.equal(pushCalls(h.calls).length, 0);
  assert.equal(h.calls.gh.length, 0);
  assert.equal(h.calls.checklist.length, 0);
  assert.equal(h.calls.mergeState.length, 0);
  const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(text, /^## \/build\n- SKIP \d{2}:\d{2}:\d{2} — Common Step 7 phase-exit push \(skipped\): /m);
  assert.equal(entriesOf(runDir).length, 1);
});

test('AC2.2: route — local-merge at test is silent', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { model: 'local-merge' });
  const env = runPhaseExit(opts(runDir, wt, 'test'), h.deps);
  assert.equal(env.route, 'local-merge');
  assert.equal(env.push.state, 'skipped');
  assert.deepEqual(entriesOf(runDir), []);
  assert.equal(pushCalls(h.calls).length, 0);
  assert.equal(h.calls.gh.length, 0);
});

test('AC2.2: route — current-branch (git-dir == common-dir) skips like local-merge', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { currentBranch: true });
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.route, 'current-branch');
  assert.equal(env.push.state, 'skipped');
  assert.deepEqual(env.bookkeeping, { worktree: 'n/a', pr: 'n/a' });
  assert.equal(pushCalls(h.calls).length, 0);
  assert.equal(h.calls.gh.length, 0);
  assert.equal(h.calls.hooks.length, 0);
  assert.equal(h.calls.checklist.length, 0);
  assert.equal(entriesOf(runDir).length, 1);
  assert.match(entriesOf(runDir)[0], /Common Step 7 phase-exit push \(skipped\)/);
});

test('route — local-merge still backfills a missing worktree stamp (Common Step 7 runs in worktree mode, not only pr-first)', () => {
  const { main, runDir, wt } = fixture({});
  const h = makeDeps(main, wt, { model: 'local-merge' });
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.deepEqual(env.bookkeeping, { worktree: 'backfilled', pr: 'n/a' });
  assert.deepEqual(h.calls.hooks, [['record-worktree', '--run', runDir, path.resolve(wt)]]);
  assert.equal(h.calls.gh.length, 0);
  assert.deepEqual(entriesOf(runDir).map(stripTime), [
    '- AUTO — Common Step 7 bookkeeping assertion: backfilled worktree registration before phase-exit push. Reversibility: high.',
    '- SKIP — Common Step 7 phase-exit push (skipped): condition: integration-model=local-merge or current-branch mode → fallback: no phase-exit push, one push at finish. Reversibility: n/a.',
  ]);
});

test('route — an unresolvable integration-model pushes nothing and logs one SKIP degrade trace', () => {
  for (const model of [new Error('resolve-policy: boom'), '', 'something-else']) {
    const { main, runDir, wt } = fixture();
    const h = makeDeps(main, wt, { model });
    const env = runPhaseExit(opts(runDir, wt, 'review'), h.deps);
    assert.equal(env.route, null);
    assert.equal(env.push.state, 'skipped');
    assert.match(env.push.reason, /integration-model unresolved/);
    assert.equal(pushCalls(h.calls).length, 0);
    assert.equal(h.calls.checklist.length, 0);
    const entries = entriesOf(runDir);
    assert.equal(entries.length, 1);
    assert.match(entries[0], /^- SKIP .* — Phase-exit push: condition: integration-model unresolved/);
  }
});

// ---- branch guard ----

test('AC2.2: branch guard — detached HEAD and the integration branch are refused, checklist still runs, merge-state does not', () => {
  const cases = [
    { branch: '', label: 'detached HEAD' },
    { branch: 'main', label: 'main' },
    { branch: 'dev', integrationBranch: 'dev', label: 'dev' },
  ];
  for (const c of cases) {
    const { main, runDir, wt } = fixture();
    const h = makeDeps(main, wt, { branch: c.branch, integrationBranch: c.integrationBranch || '' });
    const env = runPhaseExit(opts(runDir, wt, 'test'), h.deps);
    assert.equal(env.push.state, 'refused', c.label);
    assert.equal(pushCalls(h.calls).length, 0, c.label);
    assert.equal(h.calls.checklist.length, 1, c.label);
    assert.equal(h.calls.mergeState.length, 0, c.label);
    assert.equal(env.mergeState, null);
    assert.equal(env.branch, c.branch || null);
    const entries = entriesOf(runDir).map(stripTime);
    assert.deepEqual(entries, [`- AUTO — Phase-exit push: refused to push ${c.label} at test exit — not a run branch. Reversibility: n/a.`], c.label);
  }
});

test('branch guard — integration branch falls back to origin/HEAD, then main', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, {});
  runPhaseExit(opts(runDir, wt), h.deps);
  assert.ok(h.calls.git.some((a) => a.slice(2).join(' ') === 'symbolic-ref --quiet --short refs/remotes/origin/HEAD'));
  const { main: m2, runDir: r2, wt: w2 } = fixture();
  const h2 = makeDeps(m2, w2, { branch: 'main' });
  const baseGit = h2.deps.git;
  h2.deps.git = (args) => {
    if (args[2] === 'symbolic-ref') throw new Error('not a symbolic ref');
    return baseGit(args);
  };
  const env = runPhaseExit(opts(r2, w2), h2.deps);
  assert.equal(env.push.state, 'refused');
});

// ---- commit check ----

test('AC2.2: commit check — a dirty tree logs the uncommitted-paths line and still pushes', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { porcelain: ' M a.js\0?? b.js\0R  new.js\0old.js\0' });
  const env = runPhaseExit(opts(runDir, wt, 'review'), h.deps);
  assert.deepEqual(env.commit, { clean: false, dirty: ['a.js', 'b.js', 'new.js'] });
  assert.equal(env.push.state, 'pushed');
  assert.deepEqual(pushCalls(h.calls), [['-C', wt, 'push', 'origin', BRANCH]]);
  assert.deepEqual(entriesOf(runDir).map(stripTime), [
    '- AUTO — Phase-exit push: 3 uncommitted path(s) at review exit not included in the push. Reversibility: n/a.',
  ]);
  assert.match(fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8'), /^## \/review$/m);
});

test('commit check — a clean tree is commit.clean true with no entry', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.deepEqual(env.commit, { clean: true, dirty: [] });
  assert.equal(env.head, 'abc1234def');
  assert.equal(env.branch, BRANCH);
});

// ---- bookkeeping ----

test('AC2.2: bookkeeping — missing worktree calls record-worktree and logs the backfill line', () => {
  const { main, runDir, wt } = fixture({ pr: { number: 42, url: PR_URL } });
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.bookkeeping.worktree, 'backfilled');
  assert.equal(env.bookkeeping.pr, 'present');
  assert.deepEqual(h.calls.hooks, [['record-worktree', '--run', runDir, path.resolve(wt)]]);
  assert.deepEqual(entriesOf(runDir).map(stripTime), [
    '- AUTO — Common Step 7 bookkeeping assertion: backfilled worktree registration before phase-exit push. Reversibility: high.',
  ]);
});

test('bookkeeping — other phases log under their own step name and section', () => {
  const { main, runDir, wt } = fixture({ pr: { number: 42, url: PR_URL } });
  const h = makeDeps(main, wt);
  runPhaseExit(opts(runDir, wt, 'polish'), h.deps);
  const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
  assert.match(text, /^## \/flow\n- AUTO \d{2}:\d{2}:\d{2} — Phase-exit bookkeeping assertion: backfilled worktree registration before phase-exit push\. Reversibility: high\.$/m);
});

test('AC2.2: bookkeeping — missing pr with one open PR records it', () => {
  const { main, runDir, wt } = fixture({ worktree: '/wt' });
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.bookkeeping.pr, 'backfilled');
  assert.deepEqual(h.calls.gh, [['pr', 'list', '--head', BRANCH, '--state', 'open', '--json', 'number,url']]);
  assert.deepEqual(h.calls.hooks, [['record-pr', '--run', runDir, '42', PR_URL]]);
  assert.deepEqual(entriesOf(runDir).map(stripTime), [
    '- AUTO — Common Step 7 bookkeeping assertion: backfilled PR-early lifecycle (recorded open PR #42) before phase-exit push. Reversibility: high.',
  ]);
});

test('AC2.2: bookkeeping — missing pr with no open PR reports missing and logs nothing', () => {
  const { main, runDir, wt } = fixture({ worktree: '/wt' });
  const h = makeDeps(main, wt, { prList: [] });
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.bookkeeping.pr, 'missing');
  assert.equal(h.calls.hooks.length, 0);
  assert.deepEqual(entriesOf(runDir), []);
});

test('bookkeeping — a prExempt run is pr n/a with no lookup', () => {
  const { main, runDir, wt } = fixture({ worktree: '/wt', prExempt: true });
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.bookkeeping.pr, 'n/a');
  assert.equal(h.calls.gh.length, 0);
});

test('bookkeeping — an ambiguous, unreadable or unrecorded PR lookup reports failed and logs nothing', () => {
  const cases = [
    { prList: [{ number: 42, url: PR_URL }, { number: 43, url: `${PR_URL}3` }], detail: /2 open PRs/ },
    { prList: new Error('gh: network'), detail: /gh pr list failed/ },
    { prList: 'not json', detail: /gh pr list failed/ },
    { prList: [{ number: 'x', url: PR_URL }], detail: /unusable/ },
    { recordPr: 'claude-tweaks: failed to record PR for x — run-state.json could not be written\n', detail: /failed to record PR/ },
  ];
  for (const c of cases) {
    const { main, runDir, wt } = fixture({ worktree: '/wt' });
    const h = makeDeps(main, wt, c);
    const env = runPhaseExit(opts(runDir, wt), h.deps);
    assert.equal(env.bookkeeping.pr, 'failed');
    assert.match(env.bookkeeping.detail, c.detail);
    assert.deepEqual(entriesOf(runDir), []);
    assert.equal(env.push.state, 'pushed');
  }
});

test('AC2.2: bookkeeping — record-worktree failing output reports failed', () => {
  const failing = [
    'claude-tweaks: failed to record worktree for x — run-state.json could not be written\n',
    'claude-tweaks: --run path rejected: x — worktree not recorded\n',
    Object.assign(new Error('exit 1'), { stdout: 'claude-tweaks: record-worktree requires --run — worktree not recorded\n' }),
  ];
  for (const recordWorktree of failing) {
    const { main, runDir, wt } = fixture({ pr: { number: 42, url: PR_URL } });
    const h = makeDeps(main, wt, { recordWorktree });
    const env = runPhaseExit(opts(runDir, wt), h.deps);
    assert.equal(env.bookkeeping.worktree, 'failed');
    assert.match(env.bookkeeping.detail, /record/);
    assert.deepEqual(entriesOf(runDir), []);
    assert.equal(env.push.state, 'pushed');
  }
});

test('bookkeeping — an archived run dir is never written: absent fields report failed / missing', () => {
  const { main, runDir, wt } = fixture({}, { archived: true });
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt, 'wrap-up'), h.deps);
  assert.equal(env.bookkeeping.worktree, 'failed');
  assert.equal(env.bookkeeping.pr, 'missing');
  assert.match(env.bookkeeping.detail, /archived/);
  assert.equal(h.calls.hooks.length, 0);
  assert.equal(h.calls.gh.length, 0);
  assert.equal(env.push.state, 'pushed');
  assert.deepEqual(entriesOf(runDir), []);
});

// ---- push ----

test('AC2.2: push failure logs the FAILED line, skips merge-state, still flips the checklist', () => {
  const { main, runDir, wt } = fixture();
  const fail = Object.assign(new Error('Command failed'), { stderr: '\nfatal: unable to access remote\nmore\n' });
  const h = makeDeps(main, wt, { push: fail });
  const env = runPhaseExit(opts(runDir, wt), h.deps);
  assert.equal(env.push.state, 'failed');
  assert.equal(env.push.reason, 'fatal: unable to access remote');
  assert.equal(h.calls.checklist.length, 1);
  assert.equal(h.calls.mergeState.length, 0);
  assert.equal(env.mergeState, null);
  assert.ok(!fs.readFileSync(path.join(runDir, 'run-state.json'), 'utf8').includes('push'));
  assert.deepEqual(entriesOf(runDir).map(stripTime), [
    `- AUTO — Phase-exit push: push of ${BRANCH} to origin FAILED at build exit (fatal: unable to access remote); the next phase exit's push retries. Reversibility: n/a.`,
  ]);
});

// ---- checklist ----

test('AC2.2: checklist exit 4/5 is reported in the envelope with exit 0 overall', () => {
  for (const code of [4, 5]) {
    const { main, runDir, wt } = fixture();
    const h = makeDeps(main, wt, { checklist: { exit: code, out: null } });
    const env = runPhaseExit(opts(runDir, wt), h.deps);
    assert.equal(env.checklist.exit, code);
    assert.equal(env.push.state, 'pushed');
    assert.deepEqual(entriesOf(runDir), []);
  }
  // Through the CLI wrapper: exit 0 overall.
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { checklist: { exit: 5, out: null } });
  assert.equal(run(['--run', runDir, '--phase', 'build', '--worktree', wt], h.deps), 0);
  assert.equal(JSON.parse(h.out.join('')).checklist.exit, 5);
});

test('checklist — the parsed envelope is carried and the forwarded flags reach pr-checklist unchanged', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt);
  const env = runPhaseExit(opts(runDir, wt, 'test', { remove: true, fixes: '12,13', summaryFile: '/s.md' }), h.deps);
  assert.deepEqual(env.checklist, { exit: 0, action: 'written', pr: 42, phase: 'build' });
  assert.deepEqual(h.calls.checklist, [['--run', runDir, '--phase', 'test', '--remove', '--fixes', '12,13', '--summary-file', '/s.md']]);
});

test('checklist — --fixes is not forwarded when absent', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt);
  runPhaseExit(opts(runDir, wt), h.deps);
  assert.deepEqual(h.calls.checklist, [['--run', runDir, '--phase', 'build']]);
});

// ---- merge state ----

test('AC2.2: merge-state envelope is carried through after a successful push', () => {
  const { main, runDir, wt } = fixture();
  const ms = { state: 'conflicting', pr: 42, mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY', phase: 'review', logged: true };
  const h = makeDeps(main, wt, { mergeState: ms });
  const env = runPhaseExit(opts(runDir, wt, 'review'), h.deps);
  assert.equal(env.push.state, 'pushed');
  assert.deepEqual(env.mergeState, ms);
  assert.deepEqual(h.calls.mergeState, [['--run', runDir, '--phase', 'review']]);
  assert.deepEqual(entriesOf(runDir), [], 'phase-exit never re-logs a sub-CLI line');
});

// ---- log failures ----

test('AC2.2: an append failure lands in logFailures and changes nothing else', () => {
  const { main, runDir, wt } = fixture({ pr: { number: 42, url: PR_URL } });
  const base = makeDeps(main, wt, { porcelain: ' M a.js\0' });
  const good = runPhaseExit(opts(runDir, wt), base.deps);
  const { main: m2, runDir: r2, wt: w2 } = fixture({ pr: { number: 42, url: PR_URL } });
  const h = makeDeps(m2, w2, { porcelain: ' M a.js\0', appendDecision: () => { throw new Error('disk full'); } });
  const env = runPhaseExit(opts(r2, w2), h.deps);
  assert.equal(env.logFailures.length, 2);
  assert.match(env.logFailures[0].error, /disk full/);
  assert.equal(env.logFailures[0].step, 'Phase-exit push');
  assert.match(env.logFailures[0].text, /1 uncommitted path\(s\)/);
  assert.equal(env.logFailures[1].step, 'Common Step 7 bookkeeping assertion');
  assert.equal(env.logFailures[1].status, 'AUTO');
  assert.match(env.logFailures[1].text, /backfilled worktree registration/);
  const strip = (e) => ({ ...e, logFailures: [], checklist: null, mergeState: null });
  assert.deepEqual(strip(env), strip(good));
  assert.equal(good.logFailures.length, 0);
  assert.equal(h.err.join('').trim().split('\n').length, 2);
});

// ---- AC3.1 parity ----

test('AC3.1: phase-exit writes the same entries the prose sequence wrote', () => {
  // Expected lines are copied from the current prose: _shared/git-discipline.md's
  // Phase-exit push SKIP command, build/SKILL.md Common Step 7's bookkeeping-assertion line,
  // and git-discipline.md's "logs a warning" on a failed push (task brief text).
  const cases = [
    { name: 'clean pr-first build exit', state: undefined, deps: {}, expected: [] },
    {
      name: 'push failure',
      state: undefined,
      deps: { push: Object.assign(new Error('x'), { stderr: 'error: failed to push some refs\n' }) },
      expected: [`- AUTO — Phase-exit push: push of ${BRANCH} to origin FAILED at build exit (error: failed to push some refs); the next phase exit's push retries. Reversibility: n/a.`],
    },
    {
      name: 'local-merge build',
      state: undefined,
      deps: { model: 'local-merge' },
      expected: ['- SKIP — Common Step 7 phase-exit push (skipped): condition: integration-model=local-merge or current-branch mode → fallback: no phase-exit push, one push at finish. Reversibility: n/a.'],
    },
    {
      name: 'missing-worktree backfill',
      state: { pr: { number: 42, url: PR_URL } },
      deps: {},
      expected: ['- AUTO — Common Step 7 bookkeeping assertion: backfilled worktree registration before phase-exit push. Reversibility: high.'],
    },
  ];
  for (const c of cases) {
    const { main, runDir, wt } = fixture(c.state);
    const h = makeDeps(main, wt, c.deps);
    runPhaseExit(opts(runDir, wt), h.deps);
    assert.deepEqual(entriesOf(runDir).map(stripTime), c.expected, c.name);
  }
});

// ---- CLI wrapper ----

test('CLI: --help exits 0 and prints usage without touching any seam', () => {
  const { main, wt } = fixture();
  const h = makeDeps(main, wt);
  assert.equal(run(['--help'], h.deps), 0);
  assert.match(h.out.join(''), /^usage: phase-exit\.js --run <run-dir> --phase <build\|test\|review\|polish\|wrap-up> --worktree <path>/);
  assert.equal(h.calls.git.length + h.calls.gh.length + h.calls.policy.length, 0);
});

test('CLI: a successful call prints one JSON line and exits 0', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt);
  assert.equal(run(['--run', runDir, '--phase', 'build', '--worktree', wt], h.deps), 0);
  const lines = h.out.join('').split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const env = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(env), ['phase', 'route', 'branch', 'head', 'commit', 'bookkeeping', 'push', 'checklist', 'mergeState', 'logFailures']);
  assert.equal(env.route, 'pr-first');
  assert.equal(env.push.state, 'pushed');
});

test('CLI: missing --worktree / --phase, an unknown phase or flag, and a malformed --fixes exit 2', () => {
  const { main, runDir, wt } = fixture();
  for (const argv of [
    ['--run', runDir, '--phase', 'build'],
    ['--run', runDir, '--worktree', wt],
    ['--phase', 'build', '--worktree', wt],
    ['--run', runDir, '--phase', 'deploy', '--worktree', wt],
    ['--run', runDir, '--phase', 'build', '--worktree', wt, '--bogus'],
    ['--run', runDir, '--phase', 'build', '--worktree', wt, '--fixes', 'abc'],
    ['--run', runDir, '--phase', 'build', '--worktree'],
  ]) {
    const h = makeDeps(main, wt);
    assert.equal(run(argv, h.deps), 2, argv.join(' '));
    assert.equal(h.calls.git.length, 0, argv.join(' '));
    assert.equal(h.out.join(''), '');
  }
});

test('CLI: a --worktree that is not a git checkout exits 2', () => {
  const { main, runDir, wt } = fixture();
  const h = makeDeps(main, wt, { git: () => { throw new Error('fatal: not a git repository'); } });
  assert.equal(run(['--run', runDir, '--phase', 'build', '--worktree', wt], h.deps), 2);
  assert.match(h.err.join(''), /not a git checkout/);
  assert.deepEqual(entriesOf(runDir), []);
});

test('CLI: unanchored or missing --run exits 3 before any probe', () => {
  const { main, wt } = fixture();
  const shadowWt = path.join(main, '.claude', 'worktrees', 'flow-spec-1');
  const shadow = path.join(shadowWt, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(shadow, { recursive: true });
  fs.writeFileSync(path.join(shadowWt, '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-1\n');
  for (const [runDir, re] of [[shadow, /not anchored/], [path.join(main, 'nope'), /does not exist/]]) {
    const h = makeDeps(main, wt);
    assert.equal(run(['--run', runDir, '--phase', 'build', '--worktree', wt], h.deps), 3);
    assert.match(h.err.join(''), re);
    assert.equal(h.calls.git.length, 0);
    assert.equal(h.out.join(''), '');
  }
  assert.ok(!fs.existsSync(path.join(shadow, 'decisions.md')));
});

test('CLI: an archived wrap-up run dir resolves', () => {
  const { main, runDir, wt } = fixture(undefined, { archived: true });
  const h = makeDeps(main, wt);
  assert.equal(run(['--run', runDir, '--phase', 'wrap-up', '--worktree', wt], h.deps), 0);
  assert.equal(JSON.parse(h.out.join('')).push.state, 'pushed');
});
