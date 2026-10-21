'use strict';
// Plan authoring probes each substituted command once with its resolver's empty value (#3592, after #3572).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readText } = require('./helpers/read-skill');

const CHECKS = readText(
  path.join(__dirname, '..', 'plugin/skills/build/plan-authoring-checks.md'));

test('AC1.1 (#3592): plan-authoring-checks carries the Empty-value probe check exactly once, citing #3572', () => {
  assert.equal(CHECKS.split('Empty-value probe check').length - 1, 1);
  const start = CHECKS.indexOf('**Empty-value probe check (extends the Derived-value probe check):**');
  assert.ok(start >= 0, 'the bold lead must be present');
  const end = CHECKS.indexOf('\n\n', start);
  const paragraph = CHECKS.slice(start, end);
  assert.ok(paragraph.includes('#3572'), 'the paragraph must cite #3572');
  assert.ok(paragraph.includes('empty or unset'), 'the paragraph must name the degenerate case');
  assert.ok(paragraph.includes('widens the query instead of failing'), 'the paragraph must give the why');
  assert.ok(paragraph.includes('`gh pr list --head "" --state merged --json number --jq length`'), 'the paragraph must quote the incident command');
});
