// tests/flow-pre-authorize-merge-conformance.test.js — pins #2734: a default-`auto` /flow run at
// an `unattended` autonomy ceiling still stalled on one manual merge-approval click, because
// `merge-authorization` can only be set by a live confirm/hybrid Manifesto override, and default
// `auto` mode's Manifesto never asks. The decision: keep the lever ceiling-independent (never a
// bookkeepingPermissions() capability — it authorizes an irreversible merge, unlike every
// reversible bookkeeping capability in that table), and add a `pre-authorize-merge` CLI arg as a
// second live, per-run, explicit answer path that works under plain `auto` without reopening the
// whole confirm/hybrid Manifesto gate. Goes red against the pre-#2734 text, which had neither the
// flag nor the documented decision.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

function between(text, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  assert.notEqual(start, -1, `missing start anchor: ${startAnchor}`);
  const end = text.indexOf(endAnchor, start);
  assert.notEqual(end, -1, `missing end anchor: ${endAnchor}`);
  return text.slice(start, end);
}

test('flow/SKILL.md declares pre-authorize-merge on every argument-hint mirror (argument-hint, both Syntax occurrences)', () => {
  const d = read('flow', 'SKILL.md');
  const count = (d.match(/\[cleanup-only\] \[pre-authorize-merge\] \[step1,step2,step3\]/g) || []).length;
  assert.equal(count, 3, 'argument-hint frontmatter + the two Syntax occurrences must all carry the new token');
});

test('flow/SKILL.md\'s Arguments table documents pre-authorize-merge as a live, per-run, explicit CLI answer, distinct from confirm/hybrid', () => {
  const d = read('flow', 'SKILL.md');
  const row = between(d, '| `pre-authorize-merge` | No |', '| `[steps]` | No |');
  assert.match(row, /#2734/);
  assert.match(row, /merge-authorization/);
  assert.match(row, /pre-authorized/);
  assert.match(row, /distinct from `confirm`\/`hybrid` mode/);
  assert.match(row, /without reopening the whole Manifesto gate/);
  assert.match(row, /Works under plain `auto` too/);
  assert.match(row, /never a skip of that check/);
});

test('flow/SKILL.md\'s Step 1 input parsing recognizes pre-authorize-merge alongside the other boolean flags', () => {
  const d = read('flow', 'SKILL.md');
  assert.match(d, /detect `worktree`, `current-branch`, `no-stories`, `no-polish`, `no-deepen`, `no-creative`, `pre-authorize-merge`/);
});

test('flow/manifesto.md\'s merge-authorization Recommendation-defaults row names the new CLI arg as a second live-override path', () => {
  const d = read('flow', 'manifesto.md');
  assert.match(d, /only a live override \(`confirm`\/`hybrid`, or the `pre-authorize-merge` arg, #2734\) sets it/);
});

test('flow/manifesto.md stays under its pinned raw-file byte budget', () => {
  const bytes = Buffer.byteLength(read('flow', 'manifesto.md'), 'utf8');
  assert.ok(bytes < 21760, `manifesto.md is ${bytes} bytes — must stay under 21760`);
});

test('_shared/autonomy-ceiling.md records the #2734 decision: ceiling-independent by design, CLI arg closes the stall', () => {
  const d = read('_shared', 'autonomy-ceiling.md');
  const sec = between(d, '**Decision (#2734):', '### Floor rule (ledger narrowing)');
  assert.match(sec, /keep this lever ceiling-independent by design/);
  assert.match(sec, /reversible\*? bookkeeping write/);
  assert.match(sec, /irreversible\*? action/);
  assert.match(sec, /non-interactive auto-grant/);
  assert.match(sec, /`pre-authorize-merge` CLI arg/);
  assert.match(sec, /delivery\*? problem, not a \*?trust\*? problem/);
});

test('wrap-up/manifesto-authorized-merge.md names both live-answer paths (confirm/hybrid and the CLI arg) in "Why policy.yml is excluded"', () => {
  const d = read('wrap-up', 'manifesto-authorized-merge.md');
  const sec = between(d, '## Why policy.yml is excluded', '## Log line');
  assert.match(sec, /confirm`\/`hybrid` mode, `13=pre-authorized`/);
  assert.match(sec, /`\/flow\s+pre-authorize-merge` CLI arg \(#2734/);
  assert.match(sec, /autonomy-ceiling\.md`'s\n?"Orthogonal to the ceiling" section/);
});

test('plugin/skills/help/reference-card.md\'s /flow row mirrors the same argument grammar', () => {
  const d = read('help', 'reference-card.md');
  assert.match(d, /\[cleanup-only\] \[pre-authorize-merge\] \[step1,step2,step3\]/);
});
