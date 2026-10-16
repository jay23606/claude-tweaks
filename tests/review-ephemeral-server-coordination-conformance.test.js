// tests/review-ephemeral-server-coordination-conformance.test.js — pins #3021: a review
// Fix-now re-verify (sequential or parallel) must stop the run's live ephemeral server before
// rebuilding the app, and restart it (or retire the stale record) afterward — and the fix-agent
// dispatch prompt must carry the no-build/no-server line, since verification stays with the
// dispatcher's own re-verify, not the fix agent. Goes red against the pre-#3021 text, which had
// no stop/restart step and no such prompt line.
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

test('step3-routing.md stops the ephemeral server before any Fix-now change or dispatch, applying to sequential and parallel alike', () => {
  const d = read('review', 'step3-routing.md');
  const sec = between(d, '**Ephemeral-server coordination before any Fix-now path (#3021).**', '## Parallel fix dispatch');
  assert.match(sec, /whether the fix below runs sequentially in the main thread or via Parallel fix dispatch/);
  assert.match(sec, /ephemeral-server\.txt/);
  assert.match(sec, /liveness-handle rule/);
  assert.match(sec, /recorded worktree matches this checkout/);
  assert.match(sec, /never stop a sibling run's server on another worktree/);
  assert.match(sec, /do not delete `ephemeral-server\.txt` yet/);
});

test('step3-routing.md restarts or retires the server once after the whole fix batch re-verifies, never per finding', () => {
  const d = read('review', 'step3-routing.md');
  const sec = between(d, '**Restart or retire the ephemeral server after re-verify (#3021).**', '## Parallel fix dispatch');
  assert.match(sec, /Run once, after the whole fix batch.*re-verified/s);
  assert.match(sec, /never per finding/);
  assert.match(sec, /still needs a browser/);
  assert.match(sec, /rewrite `\{run-dir\}\/ephemeral-server\.txt`/);
  assert.match(sec, /plain Bash redirect/);
  assert.match(sec, /never the Edit\/Write tool/);
  assert.match(sec, /leave the server stopped and remove the now-stale `ephemeral-server\.txt` line/);
});

test('step3-routing.md inlines the no-build/no-server line verbatim into the fix-agent dispatch prompt', () => {
  const d = read('review', 'step3-routing.md');
  assert.match(d, /> \*\*No builds, test suites, or servers \(#3021\):\*\*/);
  assert.match(d, /Do not run the project's builds, test suites or servers; the dispatcher re-verifies\./);
});

test('the no-build/no-server line is distinguished from the lens Read-only Reviewer Discipline rule, not merged with it', () => {
  const d = read('review', 'step3-routing.md');
  const sec = between(d, '> **No builds, test suites, or servers (#3021):**', '> **Parallel execution (conditional):**');
  assert.match(sec, /Distinct from Read-only Reviewer Discipline/);
});

test('dev-url-detection.md Cleanup section names the rebuild-under-server hazard and points at step3-routing.md', () => {
  const d = read('_shared', 'dev-url-detection.md');
  // "### Cleanup" is this file's LAST section — slice to end of file rather than hunting a
  // next-heading anchor (a naive "## " search self-matches inside the "### Cleanup" heading's
  // own leading "###" run).
  const start = d.indexOf('### Cleanup');
  assert.notEqual(start, -1, 'missing ### Cleanup heading');
  const sec = d.slice(start);
  assert.match(sec, /must stop this server first and, if still needed, restart it after \(#3021\)/);
  assert.match(sec, /step3-routing\.md/);
});

test('a standalone review (no run dir) is unaffected — the stop step is gated on a pipeline run directory existing', () => {
  const d = read('review', 'step3-routing.md');
  const sec = between(d, '**Ephemeral-server coordination before any Fix-now path (#3021).**', '## Parallel fix dispatch');
  assert.match(sec, /No pipeline run directory \(a standalone review\) or no recorded server: nothing to stop, proceed exactly as today\./);
});
