'use strict';
// tests/review-routing-line-prose-conformance.test.js — pins that
// skills/review/step3-routing.md cites bin/review-routing-line.js for every
// Step 3 Routing log line (#4488). Each bullet's cited command is executed
// against a fixture run dir, and the appended line must carry the route's
// release-gate token.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../plugin/bin/review-routing-line');
const { readText } = require('./helpers/read-skill');

const MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'review', 'step3-routing.md');
const md = readText(MD_PATH);
const NOW = new Date(2026, 7, 16, 9, 5, 7).getTime();

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rrl-prose-'));
  const main = path.join(root, 'main');
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', '2026-08-16T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'), { recursive: true });
  return { main, runDir };
}

function deps(main, out) {
  return { now: () => NOW, cwd: () => main, mainRoot: main, stdout: (s) => out.push(['out', s]), stderr: (s) => out.push(['err', s]) };
}

// Shell-ish tokenizer for the cited commands: a double-quoted span is one argv token, quotes stripped.
function argvOf(command) {
  return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]));
}

function citedCommand(bulletLabel) {
  const bullet = md.split('\n').find((l) => l.startsWith(`- **${bulletLabel}** —`));
  assert.ok(bullet, `the ${bulletLabel} bullet must exist`);
  const span = bullet.match(/`(node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/review-routing-line\.js"[^`]*)`/);
  assert.ok(span, `the ${bulletLabel} bullet must cite review-routing-line.js in a backticked command`);
  return span[1];
}

// Fill the placeholders the way a real Step 3 routing site would, then drop the `node <script>` prefix.
function instantiate(command, severity, runDir) {
  const filled = command
    .split('"$PIPELINE_RUN_DIR"').join(`"${runDir}"`)
    .split('{severity}').join(severity)
    .split('{category}').join('security')
    .split('{file:line}').join('src/a.js:12')
    .split('{hash}').join('abc1234')
    .split('{n}').join('3');
  assert.doesNotMatch(filled, /\{[a-z:]+\}/, `every placeholder must be filled: ${filled}`);
  return argvOf(filled).slice(2);
}

const CASES = [
  { label: 'AUTO', severity: 'low', status: 'AUTO', token: 'applied low-severity' },
  { label: 'STAGED', severity: 'high', status: 'STAGED', token: 'high-severity finding' },
  { label: 'KEPT-PROMPT', severity: 'critical', status: 'KEPT-PROMPT', token: 'critical finding' },
];

for (const c of CASES) {
  test(`the ${c.label} bullet's cited composer command appends a ${c.status} line carrying its release token`, () => {
    const { main, runDir } = fixture();
    const out = [];
    const argv = instantiate(citedCommand(c.label), c.severity, runDir);
    assert.equal(run(argv, deps(main, out)), 0, `exit 0 for: ${argv.join(' ')}`);
    const text = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8');
    assert.match(text, new RegExp(`^- ${c.status} `, 'm'));
    assert.ok(text.includes(c.token), `appended line must carry "${c.token}": ${text}`);
  });
}

test('step3-routing.md carries no hand-typed Step 3 Routing template', () => {
  assert.doesNotMatch(md, /Log: `(AUTO|STAGED|KEPT-PROMPT) \{time\} — Step 3 Routing:/);
});
