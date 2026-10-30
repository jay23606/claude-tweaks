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

test('scan-procedures.md Step 4.5 reconcile runs in the main thread before the scan batch (#4468)', () => {
  const section = SCAN_PROCEDURES.slice(
    SCAN_PROCEDURES.indexOf('## Step 4.5:'),
    SCAN_PROCEDURES.indexOf('## Step 4.6:'),
  );
  assert.match(section, /\*\*Reconcile first — main thread, before the scan batch:\*\*/);
  assert.match(section, /the Step 4\.5 scan agent never runs it/);
  assert.match(section, /the agent's inlined section skips this paragraph, reading converged state/);
  assert.match(section, /on a standalone run with no run dir yet, hold the JSON and log it when Step 6 mints the run dir/);
});

test('scan-execution.md\'s dispatch block runs Step 4.5\'s reconcile before dispatching (#4468)', () => {
  assert.match(SCAN_EXECUTION, /Before dispatching the batch, when Step 4\.5 is in scope, run its reconcile in the main thread/);
  assert.match(SCAN_EXECUTION, /scan agents are read-only/);
  assert.doesNotMatch(SCAN_EXECUTION, /they write nothing/);
  assert.match(SCAN_EXECUTION, /omits only the "Reconcile first" paragraph \(it keeps Working-directory discipline\)/);
  assert.match(SCAN_EXECUTION, /feed Step 6's \*\*Applied automatically\*\* section/);
  assert.match(SCAN_EXECUTION, /none mutates repo state, the forge, or the run dir/);
  assert.match(SCAN_EXECUTION, /\(no Task dispatch\), the reconcile still runs first, before Step 1/);
});

test('scan-execution.md places the main-thread reconcile before the parallel dispatch line (#4468)', () => {
  const reconcileAt = SCAN_EXECUTION.indexOf('Before dispatching the batch, when Step 4.5 is in scope');
  const dispatchAt = SCAN_EXECUTION.indexOf('**Parallel execution:** Dispatch the agent-backed steps');
  assert.ok(reconcileAt !== -1, 'reconcile paragraph is present');
  assert.ok(dispatchAt !== -1, 'parallel dispatch line is present');
  assert.ok(reconcileAt < dispatchAt, 'reconcile paragraph precedes the parallel dispatch line');
});
