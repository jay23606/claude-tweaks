// tests/build-ac-evidence-persistence-conformance.test.js — pins #3079: an acceptance criterion
// verified only by a scratch (uncommitted) check must persist its result to the run dir, not a
// conversational handoff, since /claude-tweaks:dispatch's two-call split (build,test then
// review,polish,wrap-up) shares only the run directory between calls. Goes red against the
// pre-#3079 text, which had no AC-evidence check and no read-back in review's check 2.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'plugin', 'skills');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

function between(text, startAnchor, endAnchor) {
  const start = text.indexOf(startAnchor);
  assert.notEqual(start, -1, `missing start anchor: ${startAnchor}`);
  const end = text.indexOf(endAnchor, start);
  assert.notEqual(end, -1, `missing end anchor: ${endAnchor}`);
  return text.slice(start, end);
}

test('plan-authoring-checks.md carries the AC-evidence persistence check, naming the log-decision.js shape and the evidence/ fallback', () => {
  const d = read('build', 'plan-authoring-checks.md');
  const idx = d.indexOf('**AC-evidence persistence check (#3079):**');
  assert.notEqual(idx, -1, 'missing the AC-evidence persistence check');
  const sec = d.slice(idx);
  assert.match(sec, /log-decision\.js" --run "\$PIPELINE_RUN_DIR" --status AUTO --step "AC evidence"/);
  assert.match(sec, /\{criterion\}: \{exact command shape\} -> \{pass\/fail counts\}/);
  assert.match(sec, /\$PIPELINE_RUN_DIR\/evidence\//);
  assert.match(sec, /never a conversational handoff/);
});

test('the AC-evidence check explicitly reconciles with "scratch checks stay scratch" rather than contradicting it', () => {
  const d = read('build', 'plan-authoring-checks.md');
  const idx = d.indexOf('**AC-evidence persistence check (#3079):**');
  const sec = d.slice(idx, idx + 1200);
  assert.match(sec, /governs whether the check's \*code\* is committed, never whether its \*result\* is recorded/);
});

test('code-mode-steps.md check 2 reads decisions.md for an AC evidence entry before marking a criterion not met', () => {
  const d = read('review', 'code-mode-steps.md');
  const sec = between(d, '2. **Acceptance Criteria**', '3. **Non-Goals**');
  assert.match(sec, /Before marking a criterion `not met`/);
  assert.match(sec, /\$PIPELINE_RUN_DIR/);
  assert.match(sec, /`AC evidence` step entry/);
  assert.match(sec, /log-decision\.js --step "AC evidence"/);
  assert.match(sec, /cite it as the criterion's evidence/);
  assert.match(sec, /instead of re-executing the check/);
});

test('code-mode-steps.md check 2 allows a re-check on a stale-looking entry, and leaves the standalone (no run dir) case unchanged', () => {
  const d = read('review', 'code-mode-steps.md');
  const sec = between(d, '2. **Acceptance Criteria**', '3. **Non-Goals**');
  assert.match(sec, /may still be re-checked/);
  assert.match(sec, /does not forbid one/);
  assert.match(sec, /With `\$PIPELINE_RUN_DIR` unset \(a standalone review\), this paragraph is a no-op — behavior is unchanged\./);
});

test('build/SKILL.md is left unchanged by #3079 and no file is over the context-cost ceiling', () => {
  const contextCost = require('../plugin/bin/lib/skill-audit/context-cost');
  const pluginRoot = path.join(__dirname, '..', 'plugin');
  const result = contextCost.measureSkills(pluginRoot);
  const over = contextCost.overCeiling(result);
  assert.deepStrictEqual(over, [], 'no skill file should be over the shared context-cost ceiling');
});
