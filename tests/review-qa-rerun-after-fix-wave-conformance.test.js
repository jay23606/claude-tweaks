'use strict';
// Pins #3047: /review Step 6.7 re-runs the QA stories an applied fix wave
// touched (via /claude-tweaks:test qa affected), and the summary/verdict
// comment qualify QA as stale when that re-run cannot happen.
const { test } = require('node:test');
const assert = require('node:assert');
const { readText } = require('./helpers/read-skill');
const path = require('node:path');
const { RAIL_BYTES } = require('../plugin/bin/lib/skill-audit/budgets');

const REVIEW = path.join(__dirname, '..', 'plugin', 'skills', 'review');
const steps = readText(path.join(REVIEW, 'code-mode-steps.md'));
for (const heading of ['## Step 6.7:', '## Step 7:', '## Important Notes']) {
  assert.ok(steps.includes(heading), `anchor heading missing: ${heading}`);
}
const step67 = steps.slice(steps.indexOf('## Step 6.7:'), steps.indexOf('## Step 7:'));
const step7 = steps.slice(steps.indexOf('## Step 7:'), steps.indexOf('## Important Notes'));

const template = readText(path.join(REVIEW, 'review-summary-template.md'));
for (const heading of ['### QA Validation (from /test)', '### Code Review Findings']) {
  assert.ok(template.includes(heading), `anchor heading missing: ${heading}`);
}
const qa = template.slice(template.indexOf('### QA Validation (from /test)'), template.indexOf('### Code Review Findings'));

test('AC1.1: Step 6.7 re-runs affected stories via test qa affected, gated on a fix touching story source_files', () => {
  assert.ok(step67.includes('`/claude-tweaks:test qa affected`'));
  assert.ok(step67.includes('WAVE_BASE=$(git rev-parse HEAD)'));
  assert.ok(step67.includes("`git diff --name-only {WAVE_BASE}`"));
  assert.ok(step67.includes("every QA story's `source_files`"));
  assert.ok(step67.indexOf('WAVE_BASE=$(git rev-parse HEAD)') < step67.indexOf('\n1. '), 'WAVE_BASE is captured before item 1');
});

test('Deliverable 3: the rule covers interactive Fix now as well as auto-applied fixes', () => {
  assert.ok(step67.includes('auto-applied (AUTO) or interactive Fix now alike'));
});

test('AC2.1: no intersection (or no stories, or no applied fix) means no QA re-run', () => {
  assert.ok(step67.includes('No intersection — or no stories, or no applied fix — means no QA re-run'));
  assert.ok(step67.includes('no added cost for a non-UI wave'));
});

test('WAVE_BASE is carried as a literal SHA, never as shell state that a later Bash call has lost', () => {
  assert.ok(step67.includes('paste that literal SHA wherever `{WAVE_BASE}` appears'));
  assert.ok(step67.includes('Shell state does not persist between Bash calls'));
});

test('a touched story left unexecuted (skipped, stopped, unresolved base) renders the qualifier, not a green line', () => {
  assert.ok(step67.includes('did not actually re-execute'));
  assert.ok(step67.includes('reports that story SKIPPED'));
  assert.ok(step67.includes('No QA stories affected by current changes.'));
  assert.ok(qa.includes('left such a story unexecuted'));
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

test('AC3.1: the template documents the stale-QA qualifier and when it renders', () => {
  assert.ok(qa.includes('**Stale-QA qualifier (#3047):**'));
  assert.ok(qa.includes(" — ran before the review's fix wave ({N} commits since); stories touching changed files: {ids}"));
  assert.ok(qa.includes('`git rev-list --count {WAVE_BASE}..HEAD`'));
  assert.ok(qa.includes('re-run did not happen'));
  assert.ok(qa.includes('the qualifier never renders'));
});

test('AC4.1: the template states the verdict comment copies the qualified line verbatim', () => {
  assert.ok(qa.includes('The verdict comment (`code-mode-steps.md` Step 7) copies this line verbatim.'));
});

test('I-1: a failing post-wave re-run blocks the verdict', () => {
  assert.ok(step67.includes('A re-run that reports PARTIAL FAILURE or ALL FAILED makes the verdict BLOCKED'));
});

test('I-2: the subset re-run merges into pre-wave results and the status is recomputed over all stories', () => {
  assert.ok(step67.includes("merge its results into `/test`'s pre-wave per-story results (re-run stories take their new result, the rest keep theirs)"));
  assert.ok(step67.includes('recompute'));
  assert.ok(step67.includes('over all stories'));
  assert.ok(qa.includes('recomputed over all stories'));
  assert.ok(!qa.includes('report its own status'));
});

test('I-3: the test skill contract and the skill graph record the Step 6.7 qa affected edge', () => {
  const testSkill = readText(path.join(__dirname, '..', 'plugin', 'skills', 'test', 'SKILL.md'));
  const graph = readText(path.join(__dirname, '..', 'docs', 'skill-graph.md'));
  assert.ok(testSkill.includes("except `/claude-tweaks:review` Step 6.7's post-fix-wave `qa affected` re-run (#3047)"));
  assert.ok(graph.includes('Step 6.7 also invokes `/test qa affected`'));
});

test('M-1: the qualifier distinguishes uncommitted Fix-now edits from the commit count', () => {
  assert.ok(qa.includes('plus uncommitted edits'));
});
