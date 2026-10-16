'use strict';
// tests/git-discipline-merge-state-conformance.test.js — #2986: the
// phase-exit push never checked whether the run's draft PR had started
// conflicting with the integration branch. GitHub runs no pull_request CI
// on a conflicting PR, so the checks list reads as merely pending.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const GIT_DISCIPLINE = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'git-discipline.md');
const read = (p) => fs.readFileSync(p, 'utf8');

test('git-discipline.md\'s Phase-exit push section gains the Post-push merge-state check', () => {
  const text = read(GIT_DISCIPLINE);
  assert.match(text, /Post-push merge-state check \(#2986\)/);
  assert.match(text, /pr-merge-state --run "\$PIPELINE_RUN_DIR"/);
  assert.match(text, /resolvePrStateByNumber/);
});

test('git-discipline.md treats UNKNOWN as no signal and only reacts to CONFLICTING', () => {
  const text = read(GIT_DISCIPLINE);
  const sectionIndex = text.indexOf('Post-push merge-state check (#2986)');
  assert.ok(sectionIndex !== -1);
  const section = text.slice(sectionIndex, sectionIndex + 1500);
  assert.match(section, /mergeable: "UNKNOWN".*treat it as no signal/s);
  assert.match(section, /Only on `mergeable: "CONFLICTING"`/);
});

test('git-discipline.md routes auto mode to the existing catch-up, never a new mid-flow stop in interactive/hybrid', () => {
  const text = read(GIT_DISCIPLINE);
  const sectionIndex = text.indexOf('Post-push merge-state check (#2986)');
  const section = text.slice(sectionIndex, sectionIndex + 1500);
  assert.match(section, /In `auto`\nmode, run "Catching a branch up with `main`"/);
  assert.match(section, /rather than\nadding a new mid-flow stop/);
});

test('git-discipline.md: the catch-up re-push stays worktree-scoped and never runs with uncommitted changes', () => {
  const text = read(GIT_DISCIPLINE);
  const sectionIndex = text.indexOf('Post-push merge-state check (#2986)');
  const section = text.slice(sectionIndex, sectionIndex + 1500);
  assert.match(section, /git -C "\{worktree-path\}" push origin \{branch\}/);
  assert.match(section, /never when\nthe worktree has uncommitted changes/);
});

test('hooks.js declares the pr-merge-state subcommand with a usage entry', () => {
  const hooksText = read(path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js'));
  assert.match(hooksText, /'pr-merge-state': 'pr-merge-state \[--run <dir>\]'/);
  assert.match(hooksText, /cmd === 'pr-merge-state'/);
});
