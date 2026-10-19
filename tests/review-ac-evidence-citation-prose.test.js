// tests/review-ac-evidence-citation-prose.test.js — pins #3079's review-side
// citation rule: plugin/skills/review/code-mode-steps.md Step 1, check 2
// (Acceptance Criteria) reads the run's decisions.md for an `AC evidence` entry
// written by /claude-tweaks:build's AC-evidence persistence check and cites it
// instead of re-executing the scratch check, while keeping the entry
// "evidence, not proof" and leaving the standalone (unset $PIPELINE_RUN_DIR)
// path unchanged. Reads the live skill file. The check-2 line is located by its
// leading `2. **Acceptance Criteria**` and every assertion runs on that line
// alone. The negative control runs the same assertion function against the
// frozen pre-change line and expects it to throw.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TEXT = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'review', 'code-mode-steps.md'),
  'utf8',
);

const LINE_PREFIX = '2. **Acceptance Criteria**';
const UNSET_PHRASE = 'When `$PIPELINE_RUN_DIR` is unset (standalone review), this check is unchanged';
const PRE_CHANGE_LINE =
  "2. **Acceptance Criteria** — for each criterion, determine whether it's verifiable from the code and tests. Mark as `met`, `partially met`, or `not met`.";

function assertAcEvidenceCitation(line) {
  assert.ok(
    line.includes('Before marking a criterion `not met` for lack of code or test evidence'),
    'gates the not-met verdict on the evidence check',
  );
  assert.ok(line.includes('an `AC evidence` entry naming it'), 'reads an AC evidence entry naming the criterion');
  assert.ok(line.includes('decisions.md'), 'reads decisions.md');
  assert.ok(
    line.includes("cite it as the criterion's evidence instead of re-executing the check"),
    'cites the entry instead of re-running the check',
  );
  assert.ok(line.includes('AC-evidence persistence check'), 'names the build-side AC-evidence persistence check');
  assert.ok(line.includes('evidence, not proof'), 'keeps the entry evidence, not proof');
  assert.ok(line.includes(UNSET_PHRASE), 'keeps the standalone unset-$PIPELINE_RUN_DIR path unchanged');
  assert.ok(
    line.includes("determine whether it's verifiable from the code and tests"),
    'original sentence survives',
  );
}

const HITS = TEXT.split(/\r?\n/).filter((l) => l.startsWith(LINE_PREFIX));
const LIVE_LINE = HITS[0];

test('AC2.1 (#3079): check 2 reads decisions.md for an AC evidence entry and cites it rather than re-running', () => {
  assert.strictEqual(HITS.length, 1, 'expected exactly one check-2 Acceptance Criteria line');
  assertAcEvidenceCitation(LIVE_LINE);
});

test('AC2.2 (#3079): check 2 names the unset-$PIPELINE_RUN_DIR standalone case as unchanged', () => {
  assert.strictEqual(HITS.length, 1, 'expected exactly one check-2 Acceptance Criteria line');
  assert.ok(LIVE_LINE.includes(UNSET_PHRASE), 'names the standalone unset case as unchanged');
});

test('AC2.1 (#3079): negative control — the pre-change line fails the pin', () => {
  assert.throws(() => assertAcEvidenceCitation(PRE_CHANGE_LINE));
});

test('AC2.1 (#3079): negative control — rewording "evidence, not proof" fails the pin', () => {
  const mutated = LIVE_LINE.replace('evidence, not proof', 'proof');
  assert.notStrictEqual(mutated, LIVE_LINE, 'control must actually reword the clause');
  assert.throws(() => assertAcEvidenceCitation(mutated));
});

test('AC2.1 (#3079): the second-call dispatch template checks AC evidence entries against their evidence/ log', () => {
  const lines = fs
    .readFileSync(path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'task-prompt.md'), 'utf8')
    .split(/\r?\n/);
  const stampIdx = lines.findIndex((l) => l.includes('verify.js --stamp-status'));
  const hitIdx = lines.findIndex((l) => l.includes('`AC evidence` entry') && l.includes('evidence/ log it cites'));
  assert.ok(stampIdx >= 0, 'stamp-status line present');
  assert.ok(hitIdx >= 0, 'AC evidence entry line present');
  assert.ok(hitIdx > stampIdx, 'AC evidence line sits after the verify.js --stamp-status line');
});
