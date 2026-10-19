'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

test('AC1.1: settle-parked reads CI through pr-checks.js --pr and maps its states', () => {
  const t = read('plugin/skills/dispatch/settle-parked.md');
  const start = t.indexOf('## Step 2:');
  const end = t.indexOf('## Step 4:');
  assert.ok(start >= 0 && end > start, 'Step 2 through Step 3 is found');
  const slice = t.slice(start, end);
  assert.ok(slice.includes('pr-checks.js" --pr {n}'), 'the CI read runs pr-checks.js --pr {n}');
  assert.ok(!slice.includes('statusCheckRollup'), 'the raw rollup read is retired');
  const bullet = slice.slice(slice.indexOf('- **CI status**'), slice.indexOf('- **Files changed**'));
  assert.ok(bullet.length > 0, 'the CI status bullet is found');
  for (const needle of ['pending', 'green', 'no-ci', 'passing', 'red', 'inherited-red', 'failing', 'read-failed', 'gh-absent', 'unavailable']) {
    assert.ok(bullet.includes(needle), `CI status bullet names ${needle}`);
  }
});

const PR_SCAN = 'plugin/skills/_shared/github-pr-scan.md';

function item9Slice() {
  const t = read(PR_SCAN);
  const start = t.indexOf('9. **Unarmed ready PR**');
  const end = t.indexOf('10. **Unsettled run**', start);
  assert.ok(start >= 0 && end > start, 'item 9 slice is found');
  return t.slice(start, end);
}

// The extraction sweep-backstop.test.js uses: node -e bodies closing on a bare `"` line.
function item9Scripts() {
  const scripts = [];
  const re = /node -e "\n([\s\S]*?)\n\s*"/g;
  const section = item9Slice();
  let m;
  while ((m = re.exec(section)) !== null) scripts.push(m[1].replace(/\\"/g, '"').replace(/\\\$/g, '$'));
  return scripts;
}

test('AC1.1: pr-scan item 9 gates candidates on a pr-checks.js --pr verdict', () => {
  const slice = item9Slice();
  assert.ok(slice.includes('pr-checks.js'), 'item 9 names pr-checks.js');
  assert.ok(slice.includes('--pr'), 'item 9 uses the --pr mode');
  assert.ok(slice.includes("NON_BLOCKING = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL'])"), 'the NON_BLOCKING rollup pre-filter is still present');
});

test('AC1.1: item 9 CI filter keeps green/no-ci, drops pending, red and a failed read', () => {
  const scripts = item9Scripts();
  assert.ok(scripts.length >= 2, 'item 9 has the candidate filter plus the CI filter');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-display-ci-'));
  try {
    fs.mkdirSync(path.join(tmp, 'bin'));
    fs.writeFileSync(path.join(tmp, 'bin', 'pr-checks.js'), [
      'const a = process.argv;',
      "if (a[2] !== '--pr') process.exit(2);",
      'const n = a[3];',
      "if (n === '5') process.exit(1);",
      "const state = { 1: 'green', 2: 'no-ci', 3: 'pending', 4: 'red' }[n];",
      'console.log(JSON.stringify({ state }));',
    ].join('\n'));
    const candidatesFile = path.join(tmp, 'candidates.json');
    fs.writeFileSync(candidatesFile, JSON.stringify([1, 2, 3, 4, 5].map((number) => ({ number }))));
    const script = scripts[1]
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, tmp)
      .replace(/\$PR_SCAN_UNARMED_CANDIDATES/g, candidatesFile);
    const scriptFile = path.join(tmp, 'ci-filter.js');
    fs.writeFileSync(scriptFile, script);
    const res = spawnSync('node', [scriptFile], { encoding: 'utf8' });
    assert.strictEqual(res.status, 0, `CI filter exits 0: ${res.stderr}`);
    const kept = JSON.parse(fs.readFileSync(candidatesFile, 'utf8')).map((p) => p.number);
    assert.deepStrictEqual(kept, [1, 2]);
    assert.match(res.stderr, /PR #3 not offered: CI pending/);
    assert.match(res.stderr, /PR #4 not offered: CI red/);
    assert.match(res.stderr, /PR #5 not offered: CI read-failed/);
    assert.ok(!/PR #[12] /.test(res.stderr), 'kept PRs are not reported');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('github-pr-scan.md stays under the nearCeiling', () => {
  const size = fs.statSync(path.join(ROOT, PR_SCAN)).size;
  assert.ok(size < 47250, `github-pr-scan.md is ${size} B, ceiling 47250`);
});
