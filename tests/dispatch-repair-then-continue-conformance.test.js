// tests/dispatch-repair-then-continue-conformance.test.js — pins #3226: a `missing-config`
// artifact-check result whose claim/PR evidence is otherwise intact (`repairable: true`) no
// longer routes straight to the two-call gate's §5 teardown — it repairs and continues, letting
// call 2's own `/flow` case-3 adoption rebuild `config.yml`. Also pins the #2429 status-line
// check's ordering ahead of the artifact check (and therefore ahead of this repair branch), and
// `sequential-execution.md`'s stale `/claude-tweaks:flow {target} wrap-up` teardown reference fix.
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

const AUTO_LOG_LINE = 'AUTO {time} — Artifact check: config.yml missing, claim/PR intact — repairing via call 2\'s /flow case-3 adoption. Reversibility: high.';

test('two-call-gate.md §2 carries the repair-then-continue branch with the literal AUTO log-line template', () => {
  const d = read('dispatch', 'two-call-gate.md');
  const sec = between(d, '**Repair-then-continue branch (#3226).**', '## 5. Terminal path');
  assert.match(sec, /reason: 'missing-config'/);
  assert.match(sec, /repairable: true/);
  assert.ok(sec.includes(AUTO_LOG_LINE), 'must carry the literal AUTO log-line template');
  assert.match(sec, /case 3/);
  assert.match(sec, /byte-identical to the normal call-2 invocation, no repair-context flag or hint/);
  assert.match(sec, /`missing-config` with `repairable: false`, and every other `reason` value.*still route to section 5/s);
});

test('two-call-gate.md §2 places the repair branch textually after the STATUS/OUTCOME-necessary-but-not-sufficient ordering statement', () => {
  const d = read('dispatch', 'two-call-gate.md');
  const orderingIdx = d.indexOf('STATUS/OUTCOME clearing the gate above is necessary but not sufficient');
  const repairIdx = d.indexOf('**Repair-then-continue branch (#3226).**');
  assert.notEqual(orderingIdx, -1);
  assert.notEqual(repairIdx, -1);
  assert.ok(orderingIdx < repairIdx, 'the repair branch must sit after the ordering statement it depends on');
});

test('sequential-execution.md "The loop" mirrors the same repair-then-continue branch', () => {
  const d = read('dispatch', 'sequential-execution.md');
  const sec = between(d, '**Repair-then-continue branch (#3226), mirroring', 'Where that teardown falls depends');
  assert.match(sec, /reason: 'missing-config'/);
  assert.match(sec, /repairable: true/);
  assert.ok(sec.includes(AUTO_LOG_LINE), 'must carry the same literal AUTO log-line template as two-call-gate.md');
  assert.match(sec, /case 3/);
});

test('sequential-execution.md no longer names the stale /claude-tweaks:flow {target} wrap-up teardown form', () => {
  const d = read('dispatch', 'sequential-execution.md');
  const loopSec = between(d, '## The loop', '## No per-group timeout');
  assert.doesNotMatch(loopSec, /\/claude-tweaks:flow \{target\} wrap-up/, 'the stale /flow-routed teardown reference must be gone');
  assert.match(loopSec, /\/claude-tweaks:wrap-up \{target\} cleanup-only/, 'it must name the direct cleanup-only form instead');
});

test('sequential-execution.md\'s artifact-check paragraph still runs only after the #2429 status-line check passes', () => {
  const d = read('dispatch', 'sequential-execution.md');
  const sec = between(d, '**Artifact check, first call only (#2837).**', '**Repair-then-continue branch');
  assert.match(sec, /The moment the first call's status line passes the mechanical check above, also run/);
});

// AC 9 / Deliverables ordering item: not just a narrative confirmation. Both files document the
// artifact check (and therefore this repair branch) as reachable only once the #2429 status-line
// check has already passed. Encode that documented two-step decision as a small reference
// function mirroring the prose exactly, and prove a malformed status line resolves BLOCKED even
// when the artifact-check result is otherwise repairable-shaped — the repair branch is never
// reached at all in that case, regardless of what `checkFirstCallArtifacts` itself returned.
const STATUS_RE = /^STATUS: (DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED)$/;

function decideGate(lastNonEmptyLine, artifactCheckResult) {
  if (!STATUS_RE.test(lastNonEmptyLine)) return 'BLOCKED'; // #2429 -- terminal on its own, artifact check never runs
  if (artifactCheckResult.ok) return 'DISPATCH_SECOND_CALL';
  if (artifactCheckResult.reason === 'missing-config' && artifactCheckResult.repairable === true) return 'DISPATCH_SECOND_CALL'; // #3226
  return 'SECTION_5_TEARDOWN';
}

test('#3226 ordering: a malformed status line resolves BLOCKED even when the artifact check is otherwise repairable-shaped', () => {
  const malformedLastLine = 'Looks done to me, no status word anywhere.';
  const repairableArtifactResult = { ok: false, reason: 'missing-config', repairable: true };
  assert.equal(decideGate(malformedLastLine, repairableArtifactResult), 'BLOCKED');
});

test('#3226 ordering sanity: the SAME repairable artifact result dispatches the second call once the status line is compliant', () => {
  const compliantLastLine = 'STATUS: DONE';
  const repairableArtifactResult = { ok: false, reason: 'missing-config', repairable: true };
  assert.equal(decideGate(compliantLastLine, repairableArtifactResult), 'DISPATCH_SECOND_CALL');
});

test('#3226 ordering sanity: a non-repairable missing-config result still tears down even with a compliant status line', () => {
  const compliantLastLine = 'STATUS: DONE';
  const nonRepairableArtifactResult = { ok: false, reason: 'missing-config', repairable: false };
  assert.equal(decideGate(compliantLastLine, nonRepairableArtifactResult), 'SECTION_5_TEARDOWN');
});
