'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../plugin/bin/review-routing-line');
const { readText } = require('../../helpers/read-skill');

const NOW = new Date(2026, 7, 16, 9, 5, 7).getTime();
const SKILL = path.join(__dirname, '..', '..', '..', 'plugin', 'skills', 'release', 'SKILL.md');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rrl-'));
  const main = path.join(root, 'main');
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', '2026-08-16T090000-spec-12');
  const shadow = path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.claude-tweaks', 'pipelines', '2026-08-16T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  fs.writeFileSync(path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-12\n');
  return { root, main, runDir, shadow };
}

function deps(main, out) {
  return { now: () => NOW, cwd: () => main, mainRoot: main, stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) };
}

const streamOf = (out, kind) => out.filter((o) => o[0] === kind).map((o) => o[1]).join('');
const decisionsOf = (runDir) => fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');

// The release gate's Step 3 table, read from SKILL.md (the first cell is the verdict label, so only the cells after it are scanned).
function gateTokens(skill, rowPrefix) {
  const row = skill.split('\n').find((l) => l.startsWith(rowPrefix));
  assert.ok(row, `release SKILL.md has a row starting ${rowPrefix}`);
  return [...row.split('|').slice(2).join('|').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

const skill = readText(SKILL);
const BLOCKING = gateTokens(skill, '| `review: blocking` |');
const FINDINGS = gateTokens(skill, '| `review: findings').filter((t) => t !== 'Step 3 Routing:');

// The release gate's classification (the brief's definition): blocking on a blocking token, findings on any Step 3 Routing line, else clean.
function classify(lines) {
  if (lines.some((l) => BLOCKING.some((t) => l.includes(t)))) return 'review: blocking';
  if (lines.some((l) => l.includes('Step 3 Routing:'))) return 'review: findings';
  return 'review: clean';
}

test('AC2.1: a high finding routed staged produces the literal "high-severity finding"', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--route', 'staged', '--severity', 'high', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], deps(main, out));
  assert.equal(code, 0, streamOf(out, 'err'));
  assert.equal(decisionsOf(runDir), '## /review\n- STAGED 09:05:07 — Step 3 Routing: high-severity finding security at src/a.js:12. Stage path: staged/review-3.patch. Reversibility: high.\n');
  assert.equal(streamOf(out, 'out'), decisionsOf(runDir).split('\n').slice(1).join('\n'));
});

test('release Step 3 classifies composed lines as the release gate table says', () => {
  assert.deepEqual(BLOCKING, ['critical finding', 'high-severity finding']);
  assert.deepEqual(FINDINGS, ['medium-severity finding', 'applied low-severity']);
  const cases = [
    { label: 'STAGED high', argv: ['--route', 'staged', '--severity', 'high', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], verdict: 'review: blocking' },
    { label: 'KEPT-PROMPT critical', argv: ['--route', 'kept-prompt', '--severity', 'critical', '--category', 'security', '--at', 'src/a.js:12'], verdict: 'review: blocking' },
    { label: 'STAGED medium', argv: ['--route', 'staged', '--severity', 'medium', '--category', 'naming', '--at', 'src/b.js:4', '--stage-path', 'staged/review-4.patch'], verdict: 'review: findings' },
    { label: 'AUTO low', argv: ['--route', 'auto', '--severity', 'low', '--category', 'Convention', '--at', 'src/a.js:3', '--commit', 'abc1234'], verdict: 'review: findings' },
    { label: 'AUTO medium', argv: ['--route', 'auto', '--severity', 'medium', '--category', 'Convention', '--at', 'src/a.js:3', '--commit', 'abc1234'], verdict: 'review: findings' },
    { label: 'STAGED low', argv: ['--route', 'staged', '--severity', 'low', '--category', 'naming', '--at', 'src/b.js:4', '--stage-path', 'staged/review-5.patch'], verdict: 'review: findings' },
  ];
  for (const c of cases) {
    const { main, runDir } = fixture();
    const out = [];
    assert.equal(run(['--run', runDir, ...c.argv], deps(main, out)), 0, `${c.label}: ${streamOf(out, 'err')}`);
    const lines = decisionsOf(runDir).split('\n').filter((l) => l.startsWith('- '));
    assert.equal(classify(lines), c.verdict, c.label);
  }
});

test('no composed line doubles the step prefix', () => {
  const argvs = [
    ['--route', 'staged', '--severity', 'high', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'],
    ['--route', 'kept-prompt', '--severity', 'critical', '--category', 'security', '--at', 'src/a.js:12'],
    ['--route', 'staged', '--severity', 'medium', '--category', 'naming', '--at', 'src/b.js:4', '--stage-path', 'staged/review-4.patch'],
    ['--route', 'auto', '--severity', 'low', '--category', 'Convention', '--at', 'src/a.js:3', '--commit', 'abc1234'],
  ];
  for (const argv of argvs) {
    const { main, runDir } = fixture();
    assert.equal(run(['--run', runDir, ...argv], deps(main, [])), 0, argv.join(' '));
    assert.doesNotMatch(decisionsOf(runDir), /Step 3 Routing: Step 3 Routing/, argv.join(' '));
  }
});

test('--severity High is normalised', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--route', 'staged', '--severity', 'High', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], deps(main, out));
  assert.equal(code, 0, streamOf(out, 'err'));
  assert.ok(decisionsOf(runDir).includes('high-severity finding'));
});

test('the AUTO line carries the commit in the reversibility qualifier', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--route', 'auto', '--severity', 'low', '--category', 'Convention', '--at', 'src/a.js:3', '--commit', 'abc1234'], deps(main, out));
  assert.equal(code, 0, streamOf(out, 'err'));
  assert.equal(decisionsOf(runDir), '## /review\n- AUTO 09:05:07 — Step 3 Routing: applied low-severity Convention fix at src/a.js:3. Reversibility: high (commit abc1234).\n');
});

test('every invalid route, severity or flag combination exits 2 and writes nothing', () => {
  const COMMON = ['--category', 'security', '--at', 'src/a.js:12'];
  const cases = {
    'kept-prompt with --severity high': ['--route', 'kept-prompt', '--severity', 'high', ...COMMON],
    'staged with --severity critical': ['--route', 'staged', '--severity', 'critical', ...COMMON, '--stage-path', 'staged/review-3.patch'],
    'auto with --severity high': ['--route', 'auto', '--severity', 'high', ...COMMON, '--commit', 'abc1234'],
    'auto without --commit': ['--route', 'auto', '--severity', 'low', ...COMMON],
    'staged without --stage-path': ['--route', 'staged', '--severity', 'high', ...COMMON],
    'staged with a non-matching --stage-path': ['--route', 'staged', '--severity', 'high', ...COMMON, '--stage-path', 'staged/review-x.patch'],
    'unknown --severity': ['--route', 'staged', '--severity', 'severe', ...COMMON, '--stage-path', 'staged/review-3.patch'],
    'auto with --stage-path': ['--route', 'auto', '--severity', 'low', ...COMMON, '--commit', 'abc1234', '--stage-path', 'staged/review-3.patch'],
    'staged with --commit': ['--route', 'staged', '--severity', 'high', ...COMMON, '--stage-path', 'staged/review-3.patch', '--commit', 'abc1234'],
    'kept-prompt with --stage-path': ['--route', 'kept-prompt', '--severity', 'critical', ...COMMON, '--stage-path', 'staged/review-3.patch'],
    'kept-prompt with --commit': ['--route', 'kept-prompt', '--severity', 'critical', ...COMMON, '--commit', 'abc1234'],
    'staged with a suffixed --stage-path': ['--route', 'staged', '--severity', 'high', ...COMMON, '--stage-path', 'staged/review-3.patch.bak'],
    'staged with a prefixed --stage-path': ['--route', 'staged', '--severity', 'high', ...COMMON, '--stage-path', 'x/staged/review-3.patch'],
    'auto with a non-hex --commit': ['--route', 'auto', '--severity', 'low', ...COMMON, '--commit', 'abc)'],
    'a category naming a critical finding': ['--route', 'staged', '--severity', 'low', '--category', 'critical finding', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'],
    'a category naming a severity finding in any case': ['--route', 'staged', '--severity', 'medium', '--category', 'Medium-Severity FINDING', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'],
    'a category with an interior newline': ['--route', 'staged', '--severity', 'high', '--category', 'security\nlens', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'],
    'a missing --at': ['--route', 'staged', '--severity', 'high', '--category', 'security', '--stage-path', 'staged/review-3.patch'],
    'trailing bare --category': ['--route', 'staged', '--severity', 'high', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch', '--category'],
    'empty --category': ['--route', 'staged', '--severity', 'high', '--category', '', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'],
  };
  for (const [label, argv] of Object.entries(cases)) {
    const { main, runDir } = fixture();
    const out = [];
    assert.equal(run(['--run', runDir, ...argv], deps(main, out)), 2, label);
    assert.match(streamOf(out, 'err'), /review-routing-line\.js: /, label);
    assert.equal(fs.existsSync(path.join(runDir, 'decisions.md')), false, `${label}: decisions.md never created`);
  }
});

test('a trailing bare --stage-path is a usage error naming the flag, and nothing is written', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--route', 'auto', '--severity', 'low', '--category', 'Convention', '--at', 'src/a.js:3', '--commit', 'abc1234', '--stage-path'], deps(main, out));
  assert.equal(code, 2);
  assert.match(streamOf(out, 'err'), /--stage-path requires a value/);
  assert.equal(fs.existsSync(path.join(runDir, 'decisions.md')), false, 'decisions.md never created');
});

test('an unknown --severity names the lowercase set', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--run', runDir, '--route', 'staged', '--severity', 'severe', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], deps(main, out));
  assert.equal(code, 2);
  assert.match(streamOf(out, 'err'), /--severity must be one of low\|medium\|high\|critical/);
});

test('a missing --run is a usage error from the CLI itself, and nothing is written', () => {
  const { main, runDir } = fixture();
  const out = [];
  const code = run(['--route', 'staged', '--severity', 'high', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], deps(main, out));
  assert.equal(code, 2);
  assert.match(streamOf(out, 'err'), /review-routing-line\.js: --run <run-dir> is required/);
  assert.equal(fs.existsSync(path.join(runDir, 'decisions.md')), false, 'decisions.md never created');
});

test('a shadow run dir is refused with exit 3', () => {
  const { main, shadow } = fixture();
  const out = [];
  const code = run(['--run', shadow, '--route', 'staged', '--severity', 'high', '--category', 'security', '--at', 'src/a.js:12', '--stage-path', 'staged/review-3.patch'], deps(main, out));
  assert.equal(code, 3);
  assert.match(streamOf(out, 'err'), /not anchored/);
  assert.equal(fs.existsSync(path.join(shadow, 'decisions.md')), false, 'nothing written to the shadow');
});
