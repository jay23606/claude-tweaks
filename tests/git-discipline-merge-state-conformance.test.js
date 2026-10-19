'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { readText } = require('./helpers/read-skill');
// #2986: the Post-push merge-state check is prose (the CLI it drives is covered by
// tests/bin-lib/pr-merge-state/cli.test.js) — a conflicting run PR gets no pull_request CI runs, so the
// phase-exit push section tells the run to read the merge state once per phase and, in auto
// mode, catch the branch up. These pins catch the doc drifting out from under its ACs.

const ROOT = path.join(__dirname, '..');
const read = (...p) => readText(path.join(ROOT, ...p));
const GIT_DISCIPLINE = read('plugin', 'skills', '_shared', 'git-discipline.md');
const LIFECYCLE = read('plugin', 'skills', '_shared', 'pr-early-run-lifecycle.md');

const HEADING = '### Post-push merge-state check';

// Shared by the positive test and the go-red control — the control mutates a copy and expects
// THIS function to throw, so a no-op assertion cannot pass both.
function assertMergeStateSection(text) {
  const start = text.indexOf(HEADING);
  assert.ok(start !== -1, `AC1.1: "${HEADING}" subsection not found`);
  const phaseExit = text.indexOf('## Phase-exit push');
  const catchUp = text.indexOf('## Catching a branch up with `main`');
  assert.ok(
    phaseExit !== -1 && phaseExit < start && start < catchUp,
    'AC1.1: the subsection sits after "## Phase-exit push" and before "## Catching a branch up with `main`"',
  );
  // Whitespace-collapsed so a re-wrap of the prose never breaks a pin.
  const section = text.slice(start, catchUp).replace(/\s+/g, ' ');

  const has = (needle, msg) => assert.ok(section.includes(needle), `${msg}: missing ${JSON.stringify(needle)}`);
  const matches = (re, msg) => assert.match(section, re, msg);

  // AC1.1 — one read, after every successful push, through the shared resolver.
  has(
    'node "${CLAUDE_PLUGIN_ROOT}/bin/pr-merge-state.js" --run "$PIPELINE_RUN_DIR" --phase',
    'AC1.1: the CLI invocation',
  );
  has('After every successful phase-exit push', 'AC1.1: runs after every successful push');
  has('resolvePrStateByNumber', 'AC1.1: names the shared PR-state read');
  matches(
    /\*\*`conflicting`\*\*[^]*?\bDIRTY\b[^]*?\bCONFLICTING\b[^]*?already written one `AUTO` entry/,
    'AC1.1: the conflicting bullet names DIRTY and CONFLICTING and says the CLI already wrote the AUTO entry',
  );

  // AC2.1 — auto catch-up: status, fetch, merge, push, in that order, merge never rebase.
  const order = [
    'git -C "{worktree-path}" status --porcelain',
    'git -C "{worktree-path}" fetch origin {integration-branch}',
    'git -C "{worktree-path}" rev-parse --short HEAD',
    'git -C "{worktree-path}" merge --no-edit origin/{integration-branch}',
    'git -C "{worktree-path}" merge --abort',
    'git -C "{worktree-path}" push origin {branch}',
  ];
  let from = 0;
  for (const needle of order) {
    const at = section.indexOf(needle, from);
    assert.ok(at !== -1, `AC2.1: catch-up step ${JSON.stringify(needle)} missing or out of order`);
    from = at + needle.length;
  }
  has('never rebase', 'AC2.1: merge, never rebase');
  has('before the next phase starts', 'AC2.1: auto catches up before the next phase');
  has('no new stop', 'AC2.1: interactive/hybrid adds no stop');
  has('HEAD is unchanged', 'stale-forge: an unchanged HEAD is named');
  has('nothing to push', 'stale-forge: nothing to push');
  has('local merge brought in nothing', 'stale-forge: the stale-state entry is named');

  // An unresolvable auto-mode merge never asks (no new mid-flow stop), aborts, and defers to the
  // merge-time Conflict path; a failed merge never leaves the tree mid-merge.
  has('never ask', 'AC2.1: the catch-up never asks in auto');
  matches(
    /cannot be resolved confidently, run `git -C "\{worktree-path\}" merge --abort`/,
    'AC2.1: an unresolvable conflict is aborted',
  );
  matches(
    /could not resolve confidently — left for _shared\/pr-first-merge\.md's Conflict path at merge time/,
    "AC2.1: the abort entry defers to pr-first-merge.md's Conflict path at merge time",
  );
  has('never leaves the tree mid-merge', 'AC2.1: a failed merge never leaves the tree mid-merge');
  has('`interactive` and `hybrid` never run this merge themselves', 'AC2.1: interactive/hybrid only surface');

  // AC3.1 — scope: only pr-first runs with a PR reach a real read.
  matches(
    /`local-merge` and `current-branch` runs never reach this check/,
    'AC3.1: local-merge and current-branch never reach the check',
  );
  has('a run with no `pr` in `run-state.json` reads `no-pr`', 'AC3.1: no-pr state');

  // AC4.1 — a failed or unknown read changes nothing.
  has('never re-read', 'AC4.1: unknown is never re-read');
  has('fail open', 'AC4.1: a failed read fails open');
  has('--step "Post-push merge-state check"', 'AC4.1: the SKIP entry names the step');

  // Wrap-up has no next phase; the merge-time conflict path owns it.
  matches(
    /`_shared\/pr-first-merge\.md`'s Conflict path/,
    "wrap-up: names pr-first-merge.md's Conflict path",
  );
}

test('git-discipline.md carries the Post-push merge-state check with every pinned phrase', () => {
  assertMergeStateSection(GIT_DISCIPLINE);
});

test('go-red control: dropping the --phase CLI invocation makes the shared assertion throw', () => {
  const mutated = GIT_DISCIPLINE.split('\n')
    .filter((line) => !/pr-merge-state\.js" --run .* --phase/.test(line))
    .join('\n');
  assert.ok(mutated !== GIT_DISCIPLINE, 'the control must actually mutate the text');
  assert.throws(() => assertMergeStateSection(mutated), /AC1\.1: the CLI invocation/);
});

test('pr-early-run-lifecycle.md cross-references the Post-push merge-state check', () => {
  assert.match(
    LIFECYCLE.replace(/\s+/g, ' '),
    /Post-push merge-state check/,
    'the lifecycle file points at the phase-exit merge-state check',
  );
});
