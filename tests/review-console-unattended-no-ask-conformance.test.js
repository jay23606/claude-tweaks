'use strict';
// #3949 AC7 — the unattended Review Console asks no question (IL-167) and still renders in
// full ("zero-click, never zero-render"); AC4's template half — the read-only Dropped by
// tiebreak block and the `dropped` resolution's route. Reads live prose: these sections are the
// declared contract the resolver and console-filings.js execute, so editing them is the intended
// response to a contract change, the [IL-80] carve-out. Every helper is proved red on a mutated
// copy of the live text, each against its own failure.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { readText } = require('./helpers/read-skill');

const ROOT = path.join(__dirname, '..');
const read = (...p) => readText(path.join(ROOT, ...p));
const REVIEW_CONSOLE = read('plugin', 'skills', 'wrap-up', 'review-console.md');
const TEMPLATE = read('plugin', 'skills', 'wrap-up', 'console-template.md');
const APPENDIX = read('plugin', 'skills', 'wrap-up', 'review-console-appendix.md');

// A `## ` section by its exact heading line, up to the next `## ` heading; both anchors must resolve.
function section(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.notStrictEqual(start, -1, `heading not found: ${heading}`);
  const end = text.indexOf('\n## ', start + heading.length + 1);
  assert.notStrictEqual(end, -1, `no section after: ${heading}`);
  return text.slice(start, end);
}

const SHORT_CIRCUIT = '## Auto-resolution short-circuit (`consoleAutoResolve`)';

// Every AskUserQuestion mention in the unattended branch must be a negation (zero / skip / never / no).
function askLinesWithoutNegation(text) {
  const lines = section(text, SHORT_CIRCUIT).split('\n').filter((l) => l.includes('AskUserQuestion'));
  assert.ok(lines.length > 0, 'anchor vanished — the section names no AskUserQuestion, so the sweep is vacuous');
  return lines.filter((l) => !/zero|skip|never|no /i.test(l));
}

test('AC7: every AskUserQuestion line in the unattended branch is a negation', () => {
  assert.deepStrictEqual(askLinesWithoutNegation(REVIEW_CONSOLE), []);
});

test('AC7 control: an affirmative AskUserQuestion line in the branch is caught', () => {
  const planted = 'Then call `AskUserQuestion` to confirm each filing.';
  const mutated = REVIEW_CONSOLE.replace('\nAfter resolving, proceed directly', `\n${planted}\n\nAfter resolving, proceed directly`);
  assert.notStrictEqual(mutated, REVIEW_CONSOLE);
  assert.deepStrictEqual(askLinesWithoutNegation(mutated), [planted]);
});

function namesConsoleFilings(text) {
  return /console-filings\.js" --run/.test(section(text, SHORT_CIRCUIT));
}

test('AC7: the unattended branch runs console-filings.js', () => {
  assert.ok(namesConsoleFilings(REVIEW_CONSOLE));
  const mutated = REVIEW_CONSOLE.replace(/console-filings\.js" --run/g, 'x.js" --run');
  assert.notStrictEqual(mutated, REVIEW_CONSOLE);
  assert.ok(!namesConsoleFilings(mutated), 'control: without the call the check goes red');
});

test('AC7: console-resolve.js and console-filings.js source contain no AskUserQuestion', () => {
  for (const cli of ['console-resolve.js', 'console-filings.js']) {
    const src = read('plugin', 'bin', cli);
    assert.ok(src.length > 0);
    assert.ok(!src.includes('AskUserQuestion'), `${cli} names AskUserQuestion`);
  }
});

// --- AC7 render: the every-outcome fixture at unattended renders every decision row AUTO-RESOLVED ---

const PLUGIN = path.join(ROOT, 'plugin');
const { run } = require(path.join(PLUGIN, 'bin', 'console-resolve.js'));
const { resolveTiebreak } = require(path.join(PLUGIN, 'bin', 'lib', 'tiebreak'));
const { formatEntry } = require(path.join(PLUGIN, 'bin', 'lib', 'log-decision', 'append'));

const NOW = new Date(2026, 9, 24, 10, 0, 0);
const QUOTE_FILE = Array.from({ length: 300 }, () => 'quote text here').join('\n');
const finding = (n, over = {}) => ({ lens: '3a', path: `src/f${n}.js`, line: 9, claim: `claim ${n}`, reporterSeverity: 'medium', kind: 'unconfirmed', ...over });
// A verdict line built through the real resolver and the sanctioned formatter, never typed by hand.
function verdict(f, { verdict: v = 'cant-tell', severity = 'medium', recommendation = null } = {}) {
  const evidence = v === 'cant-tell' ? '' : `Evidence: ${f.path}:${f.line} \`quote text here\`\n`;
  const rec = recommendation ? `Recommendation: ${recommendation}\n` : '';
  const r = resolveTiebreak(f, `Verdict: ${v}\n${evidence}Severity: ${severity}\n${rec}STATUS: DONE`, { readFile: () => QUOTE_FILE, now: NOW });
  return formatEntry({ status: r.logStatus, now: NOW, step: r.logStep, text: r.logText, reversibility: 'high' });
}
const stagedLine = (f) => `- STAGED 09:59:00 — Reproduction: lens "${f.lens}" finding ${f.path}:${f.line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.`;

function everyOutcomeRun() {
  const outcomes = [
    [finding(1), { verdict: 'confirmed' }],
    [finding(2, { reporterSeverity: 'low' }), { verdict: 'refuted', severity: 'low' }],
    [finding(3, { reporterSeverity: 'high' }), { verdict: 'refuted', severity: 'high' }],
    [finding(4, { reporterSeverity: 'low' }), { severity: 'low' }],
    [finding(5), { recommendation: 'file' }],
    [finding(6), { recommendation: 'drop' }],
  ];
  const decisions = [...outcomes.map(([f]) => stagedLine(f)), ...outcomes.map(([f, o]) => verdict(f, o))].join('\n');
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'console-no-ask-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'autonomy: unattended\n');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-10-24T100000-record-7');
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), `${decisions}\n`);
  return { root, runDir };
}

// The ceiling read runs `git rev-parse --show-toplevel` through the execFile seam, so the fake
// answers it with the fixture root; every member carries auto:merge.
function fakeExec(root) {
  return (cmd, args) => {
    if (cmd === 'git' && args[0] === 'rev-parse') return `${root}\n`;
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'auto:merge' }], comments: [] });
    if (cmd === 'git' && args[0] === 'apply') return '';
    throw new Error(`unexpected exec: ${cmd} ${args.join(' ')}`);
  };
}

// The decision table's rows: the lines after its `| # | Section |` header and separator, up to the first blank line.
function decisionRows(out) {
  const lines = out.split('\n');
  const head = lines.findIndex((l) => l.startsWith('| # | Section |'));
  assert.notStrictEqual(head, -1, 'no decision table rendered');
  const end = lines.indexOf('', head);
  return lines.slice(head + 2, end === -1 ? lines.length : end);
}

test('AC7 render: the every-outcome fixture at unattended stamps every decision row AUTO-RESOLVED', async () => {
  const fx = everyOutcomeRun();
  let out = '';
  const deps = { cwd: () => fx.root, mainRoot: fx.root, stdout: (s) => { out += s; }, stderr: () => {}, now: () => Date.parse('2026-10-24T12:00:00Z'), execFile: fakeExec(fx.root) };
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], deps), 0);
  const cj = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'console.json'), 'utf8'));
  const rows = decisionRows(out);
  assert.strictEqual(rows.length, cj.items.length + 1, 'one row per item plus the cleanup row — nothing dropped from the render');
  assert.ok(cj.items.length >= 2, 'the two can\'t-tell items are on the table');
  for (const row of rows) assert.match(row, /AUTO-RESOLVED: /, row);
  assert.deepStrictEqual(cj.items.filter((i) => i.resolution === 'pending' || i.resolution === 'keep-staged'), []);
  assert.match(out, /#### Dropped by tiebreak \(read-only — no decision\)/);
  assert.ok(!out.split('#### Dropped by tiebreak')[1].includes('AUTO-RESOLVED'), 'the Dropped block carries no decision');
});

test('AC7 render control: a row without the stamp is caught by the row sweep', () => {
  const rows = decisionRows('| # | Section | Item | Resolution | Reason |\n|---|---|---|---|---|\n| 1 | Low-confidence findings | x | filed | y |\n');
  assert.strictEqual(rows.length, 1);
  assert.doesNotMatch(rows[0], /AUTO-RESOLVED: /);
});

// --- AC4 template half -------------------------------------------------------------------------

const DROPPED_HEADING = /^#### Dropped by tiebreak \(read-only — no decision\)$/m;

test('AC4: console-template.md carries the read-only Dropped by tiebreak heading', () => {
  assert.match(TEMPLATE, DROPPED_HEADING);
  const mutated = TEMPLATE.replace(DROPPED_HEADING, '#### Dropped by tiebreak');
  assert.notStrictEqual(mutated, TEMPLATE);
  assert.doesNotMatch(mutated, DROPPED_HEADING, 'control: a heading that drops the read-only/no-decision clause goes red');
});

// The appendix's Resolution-to-step mapping routes `dropped` to execute-nothing.
function droppedRoute(text) {
  const mapping = section(text, '### Resolution-to-step mapping');
  return mapping.split('\n').find((l) => l.startsWith('- `dropped`')) || null;
}

test('AC4: the appendix mapping names dropped, routed to execute nothing', () => {
  const route = droppedRoute(APPENDIX);
  assert.ok(route, 'no `dropped` bullet in the Resolution-to-step mapping');
  assert.match(route, /execute \*\*nothing\*\*/);
  const mutated = APPENDIX.replace(/\n- `dropped`/, '\n- `gone`');
  assert.notStrictEqual(mutated, APPENDIX);
  assert.strictEqual(droppedRoute(mutated), null, 'control: removing the bullet goes red');
});
