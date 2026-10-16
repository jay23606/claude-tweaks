// tests/pr-checklist-spec-summary-refresh-conformance.test.js — pins #3050: a build-time
// premise reversal (the `ASSUMPTION — verify at build:` path, or Spec Step 3's own judgment that
// the plan departs from a spec premise) must feed back into the draft PR's `### Spec summary`,
// which otherwise still describes the original mechanism at merge time. Goes red against the
// pre-#3050 text, which had no canonical marker and no rewrite step at all.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

// Markdown source hand-wraps prose — collapse whitespace runs before matching so a wrap point
// never hides an otherwise-present phrase (same convention
// tests/pr-early-run-lifecycle-degrade-warning-conformance.test.js already uses).
const flatten = (s) => s.replace(/\s+/g, ' ');

function between(text, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  assert.notEqual(start, -1, `missing start anchor: ${startAnchor}`);
  const end = text.indexOf(endAnchor, start);
  assert.notEqual(end, -1, `missing end anchor: ${endAnchor}`);
  return text.slice(start, end);
}

test('build/SKILL.md names the canonical "premise reversed:" marker for the ASSUMPTION-verification reversed outcome', () => {
  const d = flatten(read('build', 'SKILL.md'));
  const sec = between(d, 'Verify `ASSUMPTION — verify at build:` markers first (#1769).', 'Plan-departure logging (#3050).');
  assert.match(sec, /premise reversed: \{original claim\} → \{what replaced it\}/);
  assert.match(sec, /pr-checklist-refresh\.md`'s Spec-summary rewrite keys on/);
});

test('build/SKILL.md names the same marker for Spec Step 3\'s own judgment-call plan departure', () => {
  const d = flatten(read('build', 'SKILL.md'));
  const sec = between(d, 'Plan-departure logging (#3050).', 'The plan will be written to');
  assert.match(sec, /premise reversed: \{original claim\} → \{what the plan implements instead\}/);
  assert.match(sec, /one marker both the `ASSUMPTION` path above and this judgment-call path write/);
});

test('pr-checklist-refresh.md\'s Phase-checklist update names the Spec-summary rewrite, its trigger, the note text, and the idempotency rule', () => {
  const d = flatten(read('_shared', 'pr-checklist-refresh.md'));
  const sec = between(d, 'Spec-summary rewrite on a premise reversal (#3050).', '## Pre-merge title/description refresh');
  assert.match(sec, /premise reversed:/, 'must name the trigger marker');
  assert.match(sec, /Revised during build: \{original claim\} → \{implemented behavior\}/, 'must name the exact note text');
  assert.match(sec, /Idempotency check first/i);
  assert.match(sec, /leave the section unchanged — nothing to do\./);
});

test('pr-checklist-refresh.md locates the Spec-summary span by plain heading text, never an HTML-comment delimiter', () => {
  const d = flatten(read('_shared', 'pr-checklist-refresh.md'));
  const sec = between(d, 'Spec-summary rewrite on a premise reversal (#3050).', '## Pre-merge title/description refresh');
  assert.match(sec, /### Spec summary.*### Phases/);
  assert.match(sec, /never\*\* an HTML-comment delimiter pair/);
  assert.match(sec, /corrupting the body on the MCP path/);
});

test('pr-checklist-refresh.md keeps a different spec\'s already-appended reversal note on a multi-spec shared PR', () => {
  const d = flatten(read('_shared', 'pr-checklist-refresh.md'));
  const sec = between(d, 'Spec-summary rewrite on a premise reversal (#3050).', '## Pre-merge title/description refresh');
  assert.match(sec, /Multi-spec runs \(shared PR, one Spec summary paragraph\)/);
  assert.match(sec, /must never drop another spec's already-appended note/);
});

test('pr-checklist-refresh.md gives a failed Spec-summary edit the same best-effort posture as a stale title or checklist', () => {
  const d = flatten(read('_shared', 'pr-checklist-refresh.md'));
  const sec = between(d, 'Spec-summary rewrite on a premise reversal (#3050).', '## Pre-merge title/description refresh');
  assert.match(sec, /never blocks the phase exit or the merge/);
});

test('the pre-merge refresh re-runs the Phase-checklist update unconditionally, so the Spec-summary rewrite is current at merge time with no separate step', () => {
  const d = flatten(read('_shared', 'pr-checklist-refresh.md'));
  const sec = between(d, '## Pre-merge title/description refresh', '## Merge-time gh-absent degrade');
  assert.match(sec, /Re-run the Phase-checklist update procedure above once more, unconditionally/);
});

test('pr-early-run-lifecycle.md notes the Spec summary paragraph may be rewritten after a reversal, pointing at pr-checklist-refresh.md', () => {
  const d = flatten(read('_shared', 'pr-early-run-lifecycle.md'));
  assert.match(d, /This `### Spec summary` paragraph is not necessarily final \(#3050\)\./);
  assert.match(d, /pr-checklist-refresh\.md`'s Phase-checklist update re-composes this paragraph/);
});
