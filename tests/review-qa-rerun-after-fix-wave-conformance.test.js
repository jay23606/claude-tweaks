'use strict';
// Pins #3047: /review Step 6.7 re-runs the QA stories an applied fix wave
// touched (via /claude-tweaks:test qa affected), and the summary/verdict
// comment qualify QA as stale when that re-run cannot happen.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RAIL_BYTES } = require('../plugin/bin/lib/skill-audit/budgets');

const REVIEW = path.join(__dirname, '..', 'plugin', 'skills', 'review');
const steps = fs.readFileSync(path.join(REVIEW, 'code-mode-steps.md'), 'utf8');
const step67 = steps.slice(steps.indexOf('## Step 6.7:'), steps.indexOf('## Step 7:'));
const step7 = steps.slice(steps.indexOf('## Step 7:'), steps.indexOf('## Important Notes'));

test('AC1.1: Step 6.7 re-runs affected stories via test qa affected, gated on a fix touching story source_files', () => {
  assert.ok(step67.includes('`/claude-tweaks:test qa affected`'));
  assert.ok(step67.includes('WAVE_BASE=$(git rev-parse HEAD)'));
  assert.ok(step67.includes("`git diff --name-only {WAVE_BASE}..HEAD`"));
  assert.ok(step67.includes("every QA story's `source_files`"));
});

test('Deliverable 3: the rule covers interactive Fix now as well as auto-applied fixes', () => {
  assert.ok(step67.includes('auto-applied (AUTO) or interactive Fix now alike'));
});

test('AC2.1: no intersection (or no stories, or no applied fix) means no QA re-run', () => {
  assert.ok(step67.includes('No intersection — or no stories, or no applied fix — means no QA re-run'));
  assert.ok(step67.includes('no added cost for a non-UI wave'));
});

test('Gotcha: a self-skipped or errored re-run renders the stale-QA qualifier, never the pre-wave status', () => {
  assert.ok(step67.includes('self-skips with no dev server or browser, or errors'));
  assert.ok(step67.includes('stale-QA qualifier'));
  assert.ok(step67.includes('never the pre-wave status unqualified'));
});

test('AC4.1: the verdict comment carries the same qualified QA status, no separate wording', () => {
  assert.ok(step7.includes("the QA status exactly as the summary's QA Validation line renders it (stale-QA qualifier included — no separate wording)"));
  assert.match(step7, /top findings by severity \(max 5\)/);
});

test('AC5.1: code-mode-steps.md stays under the Read-limit byte rail', () => {
  assert.ok(Buffer.byteLength(steps) <= RAIL_BYTES, `${Buffer.byteLength(steps)} > ${RAIL_BYTES}`);
});
