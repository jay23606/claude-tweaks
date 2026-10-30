// tests/tidy-scan-dispatch-conformance.test.js
// Pins /tidy's scan-agent dispatch contract (record #4468): the scan-agent output template
// returns every finding as its own row with no row cap and no "+N more" count row, and the
// Work Records step no longer cites a scan-agent row cap as bounding the repair list.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { readText } = require('./helpers/read-skill');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => readText(path.join(REPO_ROOT, rel));

const SCAN_EXECUTION = read('plugin/skills/tidy/scan-execution.md');
const SCAN_PROCEDURES = read('plugin/skills/tidy/scan-procedures.md');
const STEP1_RECORDS = read('plugin/skills/tidy/step-1-records.md');
const SCAN_ACCEPTANCE = read('plugin/skills/_shared/github-pr-scan-acceptance.md');

test('scan-execution.md\'s scan template carries no row cap or count row (#4468)', () => {
  assert.doesNotMatch(SCAN_EXECUTION, /\+N more/);
  assert.doesNotMatch(SCAN_EXECUTION, /at most \d+ rows/i);
});

test('scan-execution.md\'s scan template requires one row per finding (#4468)', () => {
  assert.match(SCAN_EXECUTION, /Return every finding as its own row/);
  assert.match(SCAN_EXECUTION, /never collapse findings into a count or summary row/);
});

test('step-1-records.md no longer cites a scan-agent row cap (#4468)', () => {
  assert.doesNotMatch(STEP1_RECORDS, /15[- ]rows?\b|at most 15\b/);
  assert.match(STEP1_RECORDS, /the candidates file, not the table, carries the full repair list/);
});

test('github-pr-scan-acceptance.md no longer describes the tidy scan as capped at 15 rows (#4468)', () => {
  assert.doesNotMatch(SCAN_ACCEPTANCE, /15[- ]rows?\b|at most 15\b/);
});
