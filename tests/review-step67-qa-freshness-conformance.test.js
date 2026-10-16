// tests/review-step67-qa-freshness-conformance.test.js — pins #3047: Step 6.7's late-findings
// wave (auto-applied or interactive "Fix now") can rewrite rendered UI after /test's QA stories
// ran, and nothing marked the QA Validation line as stale. Step 6.7 now re-runs affected QA
// stories (or, when it can't, qualifies the line) whenever an applied fix touched a story's
// `source_files`. Goes red against the pre-#3047 text, which had no such step.
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

test('code-mode-steps.md Step 6.7 points to late-findings-qa-refresh.md, gated on a finding touching a story source_files', () => {
  const d = read('review', 'code-mode-steps.md');
  const step67 = between(d, '## Step 6.7: Late Findings Routing', '## Step 7: Present Review Summary');
  assert.match(step67, /QA freshness refresh \(#3047\)/);
  assert.match(step67, /late-findings-qa-refresh\.md/);
  assert.match(step67, /touched a file listed in a QA story's `source_files`/);
  assert.match(step67, /AUTO or interactive "Fix now"/, 'must apply to both routing paths, not only auto-applied findings (#3047 Deliverable 3)');
});

test('code-mode-steps.md stays under the CEILING_BYTES soft ceiling', () => {
  const { CEILING_BYTES } = require('../plugin/bin/lib/skill-audit/context-cost');
  const size = Buffer.byteLength(read('review', 'code-mode-steps.md'), 'utf8');
  assert.ok(size < CEILING_BYTES, `code-mode-steps.md is ${size}B, over the ${CEILING_BYTES}B ceiling`);
});

test('late-findings-qa-refresh.md: no intersection means no re-run and no added cost', () => {
  const d = read('review', 'late-findings-qa-refresh.md');
  assert.match(d, /No intersection\*\* between the wave's changed files and any story's `source_files`/);
  assert.match(d, /No re-run, no added cost/);
});

test('late-findings-qa-refresh.md: an intersection with a dev server re-runs via /test qa affected', () => {
  const d = read('review', 'late-findings-qa-refresh.md');
  assert.match(d, /\/claude-tweaks:test qa affected/);
  assert.match(d, /Fold the fresh result into Step 7's QA Validation line, replacing the pre-wave status/);
});

test('late-findings-qa-refresh.md: an intersection with a self-skipped re-run renders the staleness qualifier, never the stale status as-is', () => {
  const d = read('review', 'late-findings-qa-refresh.md');
  assert.match(d, /self-skips\*\* \(headless run, no dev server/);
  assert.match(d, /ran before the review's fix wave \(\{N\} commits since\); stories touching changed files: \{ids\}/);
});

test('late-findings-qa-refresh.md runs once per wave, never per finding', () => {
  const d = read('review', 'late-findings-qa-refresh.md');
  assert.match(d, /Run once, after the whole Step 6\.7 wave has resolved — never per finding/);
});

test('review-summary-template.md documents the staleness qualifier on the QA Validation line, with the exact #3047 wording', () => {
  const t = read('review', 'review-summary-template.md');
  const sec = between(t, '### QA Validation (from /test)', '### Code Review Findings');
  assert.match(sec, /Staleness qualifier \(#3047\)/);
  assert.match(sec, /\{status\} — ran before the review's fix wave \(\{N\} commits since\); stories touching changed files: \{ids\}/);
  assert.match(sec, /the qualifier only ever marks evidence the run could not refresh/);
});
