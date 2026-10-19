'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { readText } = require('./helpers/read-skill');
// #3483: a pr-first run whose console resolves leave-open never reaches the merge path, so
// wrap-up's last phase-exit push owns a DIRTY PR there. These pins keep the prose on its ACs.

const ROOT = path.join(__dirname, '..');
const read = (...p) => readText(path.join(ROOT, ...p));
const EXEC = read('plugin', 'skills', 'wrap-up', 'execution-and-verification.md');
const GIT_DISCIPLINE = read('plugin', 'skills', '_shared', 'git-discipline.md');
const HEADING = '**Leave-open mergeability re-check';

function leaveOpenParagraph(text) {
  const start = text.indexOf(HEADING);
  assert.ok(start !== -1, `"${HEADING}" paragraph not found`);
  const phaseExit = text.indexOf('**Phase exit (`worktree` mode, `integration-model: pr-first`):**');
  const verify = text.indexOf('### Verify execution');
  assert.ok(phaseExit !== -1 && phaseExit < start && start < verify,
    'the paragraph sits after the Phase exit paragraph and before ### Verify execution');
  return text.slice(start, verify).replace(/\s+/g, ' ');
}

function assertLeaveOpenParagraph(text) {
  const p = leaveOpenParagraph(text);
  const has = (needle, msg) => assert.ok(p.includes(needle), `${msg}: missing ${JSON.stringify(needle)}`);
  // Triggers and exclusions.
  has("`merge.resolution` reads `leave-open`", 'trigger: console.json leave-open');
  has('"Approve all, leave PR open"', 'trigger: attended leave-open choice');
  has('`merged`, `armed`, or the merge path\'s own `pending-review` skips this paragraph', 'exclusion: merge-path outcomes');
  // One read, reused.
  has('`pr-merge-state.js --phase wrap-up`', 'reuses the post-push read');
  has('never a second read', 'reads once');
  // AC1.1 — clean auto-merge: commit pushed, decisions line names the sha.
  has("Catch-up steps 1-5", 'AC1.1: runs the shared catch-up');
  has('`DIRTY → merged main as {after short}`', 'AC1.1: decisions line names the merge sha');
  // AC2.1 — conflict: git auto-merge only, files listed before abort, decisions line names files.
  has('Step 4 never resolves a conflict', 'AC2.1: no conflict resolution');
  const list = p.indexOf('diff --name-only --diff-filter=U');
  const abort = p.indexOf('merge --abort');
  assert.ok(list !== -1 && abort !== -1 && list < abort, 'AC2.1: conflicting paths are listed before merge --abort');
  has('`DIRTY — conflict in {files}`', 'AC2.1: decisions line names the conflicting files');
  // AC3.1 — any other read: one log line, nothing else.
  has('log `mergeability: {mergeStateStatus}`', 'AC3.1: CLEAN/BLOCKED/UNKNOWN log one line');
  has('nothing else changes', 'AC3.1: nothing beyond the one log line');
  has('(`read-failed`, `gh-absent`, `no-pr`)', 'AC3.1: a failed read logs its state, never clean');
  // The log command.
  has('--step "Leave-open mergeability re-check"', 'log step name');
  has('--text "mergeability: {outcome}"', 'log text shape');
}

test('AC1.1/AC2.1/AC3.1: execution-and-verification.md carries the leave-open mergeability re-check', () => {
  assertLeaveOpenParagraph(EXEC);
});

test('go-red control: dropping the files-before-abort listing makes the shared assertion throw', () => {
  const mutated = EXEC.replace('diff --name-only --diff-filter=U', 'diff --stat');
  assert.ok(mutated !== EXEC, 'the control must actually mutate the text');
  assert.throws(() => assertLeaveOpenParagraph(mutated), /AC2\.1/);
});

test('git-discipline.md names the leave-open exception at wrap-up exit and keeps the merge-path rule', () => {
  const flat = GIT_DISCIPLINE.replace(/\s+/g, ' ');
  assert.ok(flat.includes('no catch-up runs there, in any mode — the merge path (`_shared/pr-first-merge.md`) owns a conflict from there'));
  assert.ok(flat.includes("`wrap-up/execution-and-verification.md`'s Leave-open mergeability re-check takes it"),
    'the wrap-up-exit bullet must point at the leave-open exception');
});
