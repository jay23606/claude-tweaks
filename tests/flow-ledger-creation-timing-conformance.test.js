'use strict';
// tests/flow-ledger-creation-timing-conformance.test.js — #3036: flow's Step
// 1.8 used to create the open-items ledger before the run's worktree
// exists, so under worktree-always a run that was about to get a NEW
// worktree had no writable location (docs/plans/ denied from the main
// checkout; the gated {run-dir}/ledger.md exception was designed for a
// wrap-up-only run that never gets a worktree, not for this momentary
// window). Ledger creation now happens immediately after the worktree
// exists instead, for both the single-spec and multi-spec paths.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FLOW_SKILL = path.join(__dirname, '..', 'plugin', 'skills', 'flow', 'SKILL.md');
const BUILD_WORKTREE_SETUP = path.join(__dirname, '..', 'plugin', 'skills', 'build', 'worktree-setup.md');
const MULTI_SPEC = path.join(__dirname, '..', 'plugin', 'skills', 'flow', 'multi-spec.md');
const LEDGER_FORMAT = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'ledger-format.md');
const LEDGER_SKILL = path.join(__dirname, '..', 'plugin', 'skills', 'ledger', 'SKILL.md');
const REVIEW_STEPS = path.join(__dirname, '..', 'plugin', 'skills', 'review', 'code-mode-steps.md');

const read = (p) => fs.readFileSync(p, 'utf8');

test('flow/SKILL.md Step 1 item 8 only creates the ledger now for current-branch or an already-isolated session', () => {
  const text = read(FLOW_SKILL);
  assert.match(text, /no NEW worktree is coming/);
  assert.match(text, /Step 1\.3 resolved `current-branch`, or this session is already inside an isolated worktree/);
});

test('flow/SKILL.md Step 1 item 8 defers creation to build/worktree-setup.md Step 4.6 or multi-spec.md\'s Shared worktree step 1 when a worktree is coming', () => {
  const text = read(FLOW_SKILL);
  assert.match(text, /build\/worktree-setup\.md`'s Step 4\.6/);
  assert.match(text, /multi-spec\.md`'s "Shared worktree" step 1/);
});

test('build/worktree-setup.md Step 4.6 creates the ledger, gated on $PIPELINE_RUN_DIR and NOT MULTISPEC_SHARED_WORKTREE', () => {
  const text = read(BUILD_WORKTREE_SETUP);
  assert.match(text, /4\.6\. \*\*Create the open-items ledger/);
  assert.match(text, /MULTISPEC_SHARED_WORKTREE` is NOT set/);
  assert.match(text, /AUTO \{time\} — flow: created open-items ledger \{path\}\. Reversibility: n\/a\./);
});

test('multi-spec.md creates one shared ledger at Shared worktree step 1, at the parent scope', () => {
  const text = read(MULTI_SPEC);
  const step1Index = text.indexOf('### Shared worktree');
  assert.ok(step1Index !== -1, 'Shared worktree section must exist');
  const step1Body = text.slice(step1Index);
  assert.match(step1Body, /Create the open-items ledger here too \(#3036\)/);
  assert.match(step1Body, /\$MULTISPEC_PARENT_DIR/);
});

test('_shared/ledger-format.md\'s No-worktree run exception is keyed on resolved strategy/shape, never run-state.json\'s momentary worktree field', () => {
  const text = read(LEDGER_FORMAT);
  assert.match(text, /will \*\*never\*\* have a worktree at all/);
  assert.match(text, /Keyed on the resolved strategy\/shape, never on `run-state\.json`'s momentary lack of a `worktree` field/);
  // The old, buggy condition this record fixes must no longer be the stated rule.
  assert.ok(
    !/no-worktree.{0,40}run-state\.json.{0,40}carries no `worktree` field, or no `run-state\.json` exists yet\s*—\s*AND/i.test(text),
    'the old momentary-field condition must not still be the stated rule',
  );
});

test('ledger/SKILL.md\'s Create names all three call sites and the #3036 fix', () => {
  const text = read(LEDGER_SKILL);
  assert.match(text, /Step 4\.6/);
  assert.match(text, /Shared worktree" step 1/);
  assert.match(text, /#3036/);
});

test('review/code-mode-steps.md\'s QA Ledger Check also checks the multi-spec parent decisions.md', () => {
  const text = read(REVIEW_STEPS);
  const sectionIndex = text.indexOf('### QA Ledger Check');
  assert.ok(sectionIndex !== -1);
  const section = text.slice(sectionIndex, sectionIndex + 1500);
  assert.match(section, /\$MULTISPEC_PARENT_DIR\/decisions\.md/);
});
