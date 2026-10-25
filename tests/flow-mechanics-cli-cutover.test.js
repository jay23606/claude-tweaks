'use strict';
// tests/flow-mechanics-cli-cutover.test.js — #4027 Task 6: the four pure-mechanics
// steps of a /flow run (claim, manifesto, materialize, PR-early open) are one CLI
// call each, and the long procedure files they implement are read only on a
// failing exit. Pins each call site to its CLI and to the read-only-on-failure
// rule, so the unconditional "read X and follow it" pointers cannot come back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readText } = require('./helpers/read-skill');
const { RAIL_BYTES } = require('../plugin/bin/lib/skill-audit/budgets');

const ROOT = path.join(__dirname, '..');
const read = (rel) => readText(path.join(ROOT, rel));
const FLOW = 'plugin/skills/flow/SKILL.md';
const BUILD = 'plugin/skills/build/SKILL.md';

// The text from `start` up to (not including) `end`; fails loudly when either
// anchor is gone, so a moved heading cannot turn an assertion vacuous.
function region(text, start, end, label) {
  const s = text.indexOf(start);
  assert.notEqual(s, -1, `${label}: start anchor ${JSON.stringify(start)} not found`);
  const e = text.indexOf(end, s + start.length);
  assert.notEqual(e, -1, `${label}: end anchor ${JSON.stringify(end)} not found`);
  return text.slice(s, e);
}

test('flow Step 2.8 is one claim-targets.js call with --steps, and claim-targets.md is read only on a non-zero exit', () => {
  const r = region(read(FLOW), '- 2.8 — Claim the targets', '### Step 3:', 'flow Step 2.8');
  assert.match(r, /bin\/claim-targets\.js" --run-id [^\n]*--steps /);
  assert.match(r, /Read `claim-targets\.md`[^\n]*only on a non-zero exit/);
  assert.doesNotMatch(r, /Read `claim-targets\.md` in this skill's directory and follow it/);
  assert.doesNotMatch(r, /`claim-targets\.md` for 2\.8's\./);
});

test('flow Step 3 runs manifesto-write.js for auto cases 2/5 and reads manifesto.md only for gated modes, case 1/3, or a non-zero exit', () => {
  const r = region(read(FLOW), '### Step 3:', '### Step 4:', 'flow Step 3');
  assert.match(r, /bin\/manifesto-write\.js" --run "\$PIPELINE_RUN_DIR" --mode auto --mode-source [^\n]*--ceremony /);
  assert.match(r, /`auto`, adoption case 2 or 5/);
  assert.match(r, /read `manifesto\.md`[^\n]*only for `confirm`\/`hybrid`, a case-1 or case-3 adoption, or a non-zero exit/i);
  assert.doesNotMatch(r, /For the complete Manifesto content/);
});

test('flow Step 4 item 2 materializes through materialize.js and reads materialize.md only on a failure or a non-null premise/drift/template field', () => {
  const r = region(read(FLOW), '2. **Execute**', '\n3. **Check the gate**', 'flow Step 4 item 2');
  assert.match(r, /bin\/materialize\.js" \{n\} --run-dir /);
  assert.match(r, /Read `materialize\.md` only on a non-zero exit[^\n]*`premise`\/`drift`\/`template` envelope field[^\n]*non-null/);
  assert.doesNotMatch(r, /compose, write, and commit the materialized file now/);
});

const PR_EARLY_READ = /read `_shared\/pr-early-run-lifecycle\.md` only on (its )?exit 2 \(`gh` absent → its MCP path\) or exit 1/i;

test('build Spec Step 1 names pr-early-open.js, reads the lifecycle file only on exit 2/1, and keeps the [IL-131] non-skippable rule on that call', () => {
  const r = region(read(BUILD), '### Spec Step 1:', '### Spec Step 2:', 'build Spec Step 1');
  assert.match(r, /bin\/pr-early-open\.js/);
  assert.match(r, PR_EARLY_READ);
  const nonSkippable = region(r, '**Non-skippable (bar `MULTISPEC_PARALLEL_WAVE=1`)', '[IL-131]', 'build non-skippable sentence');
  assert.match(nonSkippable, /`pr-early-open\.js` call/);
});

test('build/worktree-setup.md Step 6 is one pr-early-open.js call with one sentence per exit code', () => {
  const r = region(read('plugin/skills/build/worktree-setup.md'), '6. **Open the draft PR', '\n## Cherry-pick', 'worktree-setup Step 6');
  assert.match(r, /bin\/pr-early-open\.js" --run "\$PIPELINE_RUN_DIR" --target "#\{n\}[^\n]*--fixes [^\n]*--title [^\n]*--summary-file /);
  assert.match(r, PR_EARLY_READ);
  for (const code of [0, 3, 2, 1]) assert.match(r, new RegExp(`Exit ${code} →`), `no branch for exit ${code}`);
  assert.match(r, /`reopenRejected`/);
  assert.match(r, /with the Write tool/);
  assert.doesNotMatch(r, /push-then-create/);
});

test('the procedure files name their CLI as the entry point', () => {
  const lifecycle = read('plugin/skills/_shared/pr-early-run-lifecycle.md');
  assert.match(region(lifecycle, '## Callers', '## Run start', 'lifecycle Callers'), /bin\/pr-early-open\.js/);
  assert.match(read('plugin/skills/flow/manifesto.md'), /bin\/manifesto-write\.js/);
  const claim = read('plugin/skills/flow/claim-targets.md');
  assert.match(region(claim, '# Flow — Claim the Targets', '## Skip-guard', 'claim-targets lead'), /bin\/claim-targets\.js[^\n]*--steps/);
  assert.match(region(claim, '## Claim every named target', '**Log the claim', 'claim-targets claim call'), /--steps \{steps\}/);
});

test('flow/SKILL.md and build/SKILL.md stay under RAIL_BYTES', () => {
  for (const rel of [FLOW, BUILD]) {
    const bytes = Buffer.byteLength(read(rel), 'utf8');
    assert.ok(bytes < RAIL_BYTES, `${rel} is ${bytes} B, rail ${RAIL_BYTES} B`);
  }
});
