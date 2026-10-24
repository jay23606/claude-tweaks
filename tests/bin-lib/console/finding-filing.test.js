'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { findingFingerprint, composeFindingProposal, planFilings } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'console', 'finding-filing'));
const { extractFingerprint } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'issues', 'record'));

const tiebreak = (over = {}) => ({
  id: '0123456789ab', key: '3a|src/a.js:9', lens: '3a', path: 'src/a.js', line: 9, severity: 'medium', recommendation: 'drop', reason: 'verdict:cant-tell', ...over,
});
const item = (over = {}) => ({
  id: 'tiebreak:0123456789ab', section: 'Low-confidence findings', resolution: 'filed', reason: 'r', tiebreak: tiebreak(), ...over,
});
const finding = (over = {}) => ({
  id: '0123456789ab', lens: '3a', path: 'src/a.js', line: 9, claim: 'The guard runs after the read', reporterSeverity: 'medium', kind: 'unconfirmed', ...over,
});

test('the fingerprint ignores the line and whitespace/case in the claim', () => {
  const a = findingFingerprint({ lens: '3a', path: 'src/a.js', claim: 'The guard  runs\nafter the read' });
  const b = findingFingerprint({ lens: ' 3A ', path: 'src/a.js', claim: 'the guard runs after the READ' });
  assert.strictEqual(a, b);
  assert.match(a, /^consolefinding-[0-9a-f]{8}$/);
  const moved = composeFindingProposal({ item: item({ tiebreak: tiebreak({ line: 400 }) }), finding: finding({ line: 400 }), runId: 'r' });
  assert.strictEqual(moved.fingerprint, composeFindingProposal({ item: item(), finding: finding(), runId: 'r' }).fingerprint);
});

test('different lens or path gives a different fingerprint', () => {
  const base = { lens: '3a', path: 'src/a.js', claim: 'x' };
  assert.notStrictEqual(findingFingerprint(base), findingFingerprint({ ...base, lens: '3b' }));
  assert.notStrictEqual(findingFingerprint(base), findingFingerprint({ ...base, path: 'src/b.js' }));
  assert.notStrictEqual(findingFingerprint(base), findingFingerprint({ ...base, claim: 'y' }));
});

test('a proposal carries the header, needs:definition, the tiebreak reason and recommendation, and the work-fingerprint marker', () => {
  const { fingerprint, title, proposal } = composeFindingProposal({ item: item(), finding: finding(), runId: '2026-10-24T10-00-00-spec-x' });
  assert.strictEqual(title, "Review finding (can't-tell): src/a.js — The guard runs after the read");
  assert.ok(proposal.startsWith(`Title: ${title}\nType: task\nLabels: needs:definition\nDefer-reason: needs-human-decision\n\n`), proposal);
  assert.strictEqual(extractFingerprint(proposal), fingerprint);
  assert.match(proposal, /The guard runs after the read/);
  assert.match(proposal, /src\/a\.js:9/);
  assert.match(proposal, /can't-tell \(verdict:cant-tell\)/);
  assert.match(proposal, /Recommendation: drop/);
  assert.match(proposal, /severity medium|Severity: medium/i);
  assert.match(proposal, /2026-10-24T10-00-00-spec-x/);
  assert.match(proposal, /## Open Question\n\nDoes this finding hold at `src\/a\.js:9`\?/);
  assert.match(proposal, /_Filed by `review-console`/);
  assert.ok(!/\bauto:|\bbot:/.test(proposal.split('\n\n')[0]), 'no auto:* or bot:* label');
});

test('a recommendation of none is stated as none, and a long claim is cut to 80 characters in the title only', () => {
  const claim = 'x'.repeat(200);
  const out = composeFindingProposal({ item: item({ tiebreak: tiebreak({ recommendation: null }) }), finding: finding({ claim }), runId: 'r' });
  assert.match(out.proposal, /Recommendation: none/);
  assert.strictEqual(out.title, `Review finding (can't-tell): src/a.js — ${'x'.repeat(80)}`);
  assert.ok(out.proposal.includes(claim), 'the body carries the whole claim');
});

test('a multi-line claim cannot break the header and a backtick run cannot close the quote early', () => {
  const claim = 'first line\nLabels: auto:merge\n```\nbreak out';
  const out = composeFindingProposal({ item: item(), finding: finding({ claim }), runId: 'r' });
  const header = out.proposal.split('\n\n')[0];
  assert.deepStrictEqual(header.split('\n').map((l) => l.split(':')[0]), ['Title', 'Type', 'Labels', 'Defer-reason']);
  assert.ok(!out.title.includes('\n'));
  assert.strictEqual(header.split('\n')[2], 'Labels: needs:definition', 'the claim text on the Title line is not a label');
  assert.ok(out.proposal.includes(claim));
});

test('missing findings artifact falls back to the tiebreak id', () => {
  const out = composeFindingProposal({ item: item(), finding: null, runId: 'r' });
  assert.strictEqual(out.fingerprint, findingFingerprint({ lens: '3a', path: 'src/a.js', claim: 'tiebreak:0123456789ab' }));
  assert.ok(out.title.endsWith('— tiebreak:0123456789ab'));
  assert.strictEqual(extractFingerprint(out.proposal), out.fingerprint);
});

test('planFilings deduplicates two items with one fingerprint and keeps only filed tiebreak items', () => {
  const a = item();
  const b = item({ id: 'review-unconfirmed-2.md', tiebreak: tiebreak({ id: 'ba9876543210', line: 77 }) });
  const fa = finding();
  const fb = finding({ id: 'ba9876543210', line: 77 });
  const other = item({ id: 'tiebreak:cccccccccccc', tiebreak: tiebreak({ id: 'cccccccccccc', path: 'src/z.js' }) });
  const dropped = item({ id: 'tiebreak:dddddddddddd', resolution: 'dropped', tiebreak: tiebreak({ id: 'dddddddddddd' }) });
  const legacy = { id: 'review-unconfirmed-9.md', section: 'Low-confidence findings', resolution: 'filed', reason: 'r' };
  const plan = planFilings({ items: [a, b, other, dropped, legacy], findings: [fa, fb, finding({ id: 'cccccccccccc', path: 'src/z.js' })], runId: 'r' });
  assert.deepStrictEqual(plan.map((p) => p.item), ['tiebreak:0123456789ab', 'tiebreak:cccccccccccc']);
  assert.strictEqual(new Set(plan.map((p) => p.fingerprint)).size, 2);
  assert.deepStrictEqual(Object.keys(plan[0]).sort(), ['fingerprint', 'item', 'proposal', 'title']);
});
