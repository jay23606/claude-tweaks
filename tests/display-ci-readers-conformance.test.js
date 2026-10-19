'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { readText } = require('./helpers/read-skill');

const ROOT = path.join(__dirname, '..');
const read = (rel) => readText(path.join(ROOT, rel));

test('AC1.1: review console classifies CI from pack.pr.value.ci (pr-checks.js), not the rollup alone', () => {
  const t = read('plugin/skills/wrap-up/review-console-interactive.md');
  const start = t.indexOf('**`integration-model: pr-first`** — read the PR\'s live CI status');
  const end = t.indexOf('Exactly one of options 1 and 2');
  assert.ok(start >= 0 && end > start, 'the pr-first paragraph and its Exactly-one trailer are both found');
  const slice = t.slice(start, end);
  for (const needle of ['pack.pr.value.ci', 'pr-checks.js" --run', 'pending', 'read-failed']) {
    assert.ok(slice.includes(needle), `slice names ${needle}`);
  }
  assert.ok(!slice.includes('--json state,mergeStateStatus,headRefOid,statusCheckRollup'), 'the inline rollup read is retired');
  const opt1 = slice.slice(slice.indexOf('- Option 1'), slice.indexOf('- Option 2'));
  const opt2 = slice.slice(slice.indexOf('- Option 2'), slice.indexOf('- Option 3'));
  assert.match(opt1, /Recommended[^\n]*green[^\n]*pending[^\n]*stale/, 'option 1 names stale alongside green/pending');
  assert.ok(opt2.includes('inherited-red'), 'option 2 names inherited-red');
});
