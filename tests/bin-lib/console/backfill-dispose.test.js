// tests/bin-lib/console/backfill-dispose.test.js — the Review Console backlog
// backfill's disposition table as code (#3950): which action, outcome and source
// each work item gets, the proposals and digest entries it carries, and the batch
// planner that dedups them against existing records and the digest.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  DIGEST_REASONS, areaFor, disposeItem, planBatch,
} = require('../../../plugin/bin/lib/console/backfill-dispose');
const { BACKFILL_OUTCOMES, BACKFILL_SOURCES } = require('../../../plugin/bin/lib/console/backfill-apply');
const { findingFingerprint } = require('../../../plugin/bin/lib/console/finding-filing');
const { extractFingerprint } = require('../../../plugin/bin/lib/issues/record');
const { parseMaterialityFingerprints } = require('../../../plugin/bin/lib/health-core/materiality-digest');

const MAIN_SHA = '0123456789abcdef0123456789abcdef01234567';
const CONSOLE_DIR = '/x/pipelines/2026-10-24T090000-spec-12';
const RUN_ID = '2026-10-24T090000-spec-12';

const findingItem = (over = {}) => ({
  itemId: 'bf:0000000000000001',
  itemHash: 'h1',
  kind: 'finding',
  section: 'Low-confidence findings',
  consoleDir: CONSOLE_DIR,
  storedIndices: [0],
  finding: { lens: '3a', path: 'plugin/skills/review/SKILL.md', line: 9, reporterSeverity: 'medium', kind: 'unconfirmed' },
  claimText: 'The guard runs after the read',
  context: '- STAGED 10:00:00 — whatever',
  ...over,
});
const noClaimItem = (over = {}) => ({
  itemId: 'bf:0000000000000002',
  itemHash: 'h2',
  kind: 'no-claim',
  section: 'Low-confidence findings',
  consoleDir: CONSOLE_DIR,
  storedIndices: [1],
  noClaimReason: 'no-path',
  context: '- STAGED 10:00:00 — a line with nothing to cite',
  ...over,
});
const stagedItem = (staged, over = {}) => ({
  itemId: 'bf:0000000000000003',
  itemHash: 'h3',
  kind: 'staged-kind',
  section: staged.section,
  consoleDir: CONSOLE_DIR,
  storedIndices: [2],
  staged,
  ...over,
});

const EVIDENCE = { path: 'plugin/skills/review/SKILL.md', line: 12, quote: 'guard(x); read(x);' };
const confirmed = (severity = 'medium') => ({ outcome: 'confirmed', severity, evidence: EVIDENCE, reason: 'confirmed by tiebreak', recommendation: null });
const dropV = { outcome: 'drop', severity: 'medium', evidence: EVIDENCE, reason: 'refuted by tiebreak', recommendation: null };
const consoleV = { outcome: 'console', severity: 'medium', evidence: null, reason: 'verdict:cant-tell', recommendation: 'drop' };
const digestV = { outcome: 'digest', severity: 'low', evidence: null, reason: 'verdict:cant-tell', recommendation: null };

const files = (map) => (_dir, name) => (Object.hasOwn(map, name) ? map[name] : null);
const dispose = (item, verdict, readStaged) => disposeItem({
  item, verdict, runId: RUN_ID, mainSha: MAIN_SHA, readStaged,
});

test('the outcomes and sources a disposition uses are the apply step\'s', () => {
  const samples = [
    dispose(findingItem(), confirmed()),
    dispose(findingItem(), dropV),
    dispose(findingItem(), digestV),
    dispose(noClaimItem()),
  ];
  for (const d of samples) {
    assert.ok(BACKFILL_OUTCOMES.includes(d.outcome), d.outcome);
    assert.ok(BACKFILL_SOURCES.includes(d.source), d.source);
  }
});

test('disposition: finding confirmed at medium or higher files the confirmed proposal', () => {
  for (const severity of ['critical', 'high', 'medium']) {
    const d = dispose(findingItem(), confirmed(severity));
    assert.deepStrictEqual([d.action, d.outcome, d.source], ['file', 'filed', 'tiebreak'], severity);
    assert.ok(d.proposal.title.startsWith('Review finding (confirmed): '), d.proposal.title);
    assert.ok(d.proposal.text.includes(`The tiebreak confirmed it on ${MAIN_SHA}: ${EVIDENCE.path}:${EVIDENCE.line} \`${EVIDENCE.quote}\`.`), d.proposal.text);
    assert.strictEqual(d.proposal.fingerprint, findingFingerprint({ lens: '3a', path: 'plugin/skills/review/SKILL.md', claim: 'The guard runs after the read' }));
    assert.strictEqual(extractFingerprint(d.proposal.text), d.proposal.fingerprint);
    assert.strictEqual(d.ref, undefined, 'a new filing has no ref yet');
    assert.strictEqual(d.itemId, 'bf:0000000000000001');
  }
});

test('disposition: finding confirmed at low or info digests with the confirmed-low reason', () => {
  for (const severity of ['low', 'info']) {
    const d = dispose(findingItem(), confirmed(severity));
    assert.deepStrictEqual([d.action, d.outcome, d.source], ['digest', 'digested', 'tiebreak'], severity);
    assert.strictEqual(d.digest.entry.deferReason, DIGEST_REASONS.CONFIRMED_LOW);
    assert.strictEqual(DIGEST_REASONS.CONFIRMED_LOW, 'console-backfill-confirmed-low');
    assert.ok(d.digest.line.includes('Defer-reason: console-backfill-confirmed-low'), d.digest.line);
  }
});

test('disposition: finding dropped by the tiebreak carries the evidence as its ref', () => {
  const d = dispose(findingItem(), dropV);
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['drop', 'dropped', 'tiebreak']);
  assert.strictEqual(d.ref, 'plugin/skills/review/SKILL.md:12 "guard(x); read(x);"');
  assert.strictEqual(d.proposal, undefined);
  assert.strictEqual(d.digest, undefined);
});

test('disposition: finding the tiebreak left to the console files a can\'t-tell proposal', () => {
  const d = dispose(findingItem(), consoleV);
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['file', 'filed', 'tiebreak']);
  assert.ok(d.proposal.title.startsWith("Review finding (can't-tell): "), d.proposal.title);
  assert.match(d.proposal.text, /can't-tell \(verdict:cant-tell\)/);
  assert.match(d.proposal.text, /Recommendation: drop/);
  assert.strictEqual(extractFingerprint(d.proposal.text), d.proposal.fingerprint);
});

test('disposition: finding the tiebreak digested uses the can\'t-tell digest reason', () => {
  const d = dispose(findingItem(), digestV);
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['digest', 'digested', 'tiebreak']);
  assert.strictEqual(d.digest.entry.deferReason, 'tiebreak-cant-tell');
  assert.strictEqual(DIGEST_REASONS.CANT_TELL, 'tiebreak-cant-tell');
  assert.ok(d.digest.line.includes('Defer-reason: tiebreak-cant-tell'), d.digest.line);
});

test('unknown reporter severity files a can\'t-tell', () => {
  // Task 1 defaults an unknown reporter severity to medium; a console verdict then files.
  const d = dispose(findingItem({ finding: { ...findingItem().finding, reporterSeverity: 'medium' } }), { ...consoleV, severity: 'medium' });
  assert.strictEqual(d.action, 'file');
  assert.strictEqual(d.outcome, 'filed');
});

test('a finding with no line files without printing "null" as a location', () => {
  const d = dispose(findingItem({ finding: { ...findingItem().finding, line: null } }), consoleV);
  assert.doesNotMatch(d.proposal.text, /:null/);
});

test('disposition: no-claim item digests with the no-claim reason, naming why', () => {
  const d = dispose(noClaimItem({ noClaimReason: 'claim-empty' }));
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['digest', 'digested', 'digest']);
  assert.strictEqual(d.digest.entry.deferReason, DIGEST_REASONS.NO_CLAIM);
  assert.match(d.digest.entry.finding, /claim-empty/);
});

test('AC4.1b: a no-claim item routes to the digest with the no-claim reason', () => {
  const d = dispose(noClaimItem());
  assert.ok(d.digest.line.includes('Defer-reason: console-backfill-no-claim'), d.digest.line);
  assert.strictEqual(DIGEST_REASONS.NO_CLAIM, 'console-backfill-no-claim');
  assert.ok(d.digest.line.includes(RUN_ID), 'the provenance is the run id');
});

test('AC4.2: a no-claim item is neither dropped nor left pending', () => {
  for (const reason of ['no-path', 'claim-empty', 'source-line-not-found', 'staged-file-absent']) {
    const d = dispose(noClaimItem({ noClaimReason: reason }));
    assert.strictEqual(d.outcome, 'digested', reason);
    assert.notStrictEqual(d.action, 'drop', reason);
  }
});

test('disposition: staged shadow-dup-duplicate dismisses, naming the anchor', () => {
  const d = dispose(stagedItem({ name: 'reflect-1.md.shadow-dup-2', section: 'Dismissed duplicates', outcome: 'shadow-dup-duplicate' }));
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['dismiss', 'dismissed', 'staged-kind']);
  assert.strictEqual(d.ref, 'duplicate of staged/reflect-1.md');
});

test('disposition: staged shadow-dup-divergent files the reconcile proposal quoting copy and anchor', () => {
  const rs = files({ 'x-1.md.shadow-dup': 'COPY BODY\n', 'x-1.md': 'ANCHOR BODY\n' });
  const d = dispose(stagedItem({ name: 'x-1.md.shadow-dup', section: 'Queue writes', outcome: 'shadow-dup-divergent' }), undefined, rs);
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['file', 'filed', 'staged-kind']);
  assert.strictEqual(d.proposal.title, 'Reconcile staged copy x-1.md.shadow-dup');
  assert.match(d.proposal.text, /COPY BODY/);
  assert.match(d.proposal.text, /ANCHOR BODY/);
  assert.ok(d.proposal.text.startsWith('Title: Reconcile staged copy x-1.md.shadow-dup\n'));
  assert.strictEqual(d.proposal.fingerprint, null, 'the shadow-dup record carries no fingerprint of its own');
});

test('disposition: staged shadow-dup-collision files the reconcile proposal', () => {
  const rs = files({ 'x-1.md.shadow-dup': 'COPY BODY\n' });
  const d = dispose(stagedItem({ name: 'x-1.md.shadow-dup', section: 'Queue writes', outcome: 'shadow-dup-collision' }), undefined, rs);
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['file', 'filed', 'staged-kind']);
  assert.match(d.proposal.text, /COPY BODY/);
  assert.match(d.proposal.text, /anchor `staged\/x-1\.md` was missing or unreadable/);
});

test('disposition: a Queue writes item with no reason and a Title: header files the staged text as written', () => {
  const text = 'Title: Do the thing\nType: task\nLabels: needs:definition\nDefer-reason: needs-human-decision\n\n## Current State\n\nx\n';
  const d = dispose(stagedItem({ name: 'leftover-3.md', section: 'Queue writes' }), undefined, files({ 'leftover-3.md': text }));
  assert.deepStrictEqual([d.action, d.outcome, d.source], ['file', 'filed', 'staged-kind']);
  assert.strictEqual(d.proposal.text, text);
  assert.strictEqual(d.proposal.title, 'Do the thing');
  assert.strictEqual(d.proposal.fingerprint, null);
});

test('a Queue writes proposal carrying a work-fingerprint marker keeps it for dedup', () => {
  const text = 'Title: T\nType: task\nLabels: needs:definition\n\nbody\n<!-- work-fingerprint: tidy-abcd1234 -->\n';
  const d = dispose(stagedItem({ name: 'tidy-1.md', section: 'Queue writes' }), undefined, files({ 'tidy-1.md': text }));
  assert.strictEqual(d.proposal.fingerprint, 'tidy-abcd1234');
});

test('disposition: any other staged-kind digests as unmapped, naming the file and why', () => {
  // Queue writes without a Title: header (a reflect finding), a reasoned Queue row, a pending row, an engine row.
  const reflect = dispose(
    stagedItem({ name: 'reflect-1.md', section: 'Queue writes' }),
    undefined,
    files({ 'reflect-1.md': '# Reflect — staged finding 1\n\n**Category:** tangential\n**Files:** plugin/bin/lib/a.js, general\n\n## Finding\n\nThe ledger grew without bound.\n' }),
  );
  assert.deepStrictEqual([reflect.action, reflect.outcome, reflect.source], ['digest', 'digested', 'digest']);
  assert.strictEqual(reflect.digest.entry.deferReason, DIGEST_REASONS.UNMAPPED_KIND);
  assert.strictEqual(DIGEST_REASONS.UNMAPPED_KIND, 'console-backfill-unmapped-kind');
  assert.match(reflect.digest.entry.finding, /^reflect-1\.md \(Queue writes\)/);
  assert.match(reflect.digest.entry.finding, /The ledger grew without bound\./, 'the staged file\'s first body line');
  assert.strictEqual(reflect.digest.entry.area, 'reflect');
  assert.strictEqual(reflect.digest.entry.fileRefs, 'plugin/bin/lib/a.js, general', 'a reflect file\'s **Files:** value');

  const reasoned = dispose(stagedItem({ name: 'premise-satisfied-4.md', section: 'Queue writes', reason: 'premise-satisfied-close-proposal' }), undefined, files({ 'premise-satisfied-4.md': 'Title: X\n\nbody' }));
  assert.strictEqual(reasoned.action, 'digest', 'a reasoned Queue row is never filed');
  assert.match(reasoned.digest.entry.finding, /premise-satisfied-4\.md \(premise-satisfied-close-proposal\)/);

  const pending = dispose(stagedItem({ name: 'polish-suggestion-2.md', section: 'Pending review' }), undefined, files({ 'polish-suggestion-2.md': '# Polish\n\nRename the helper.\n' }));
  assert.strictEqual(pending.action, 'digest');
  assert.match(pending.digest.entry.finding, /polish-suggestion-2\.md \(Pending review\)/);
  assert.strictEqual(pending.digest.entry.fileRefs, 'general');

  const engine = dispose(stagedItem({ name: 'docs:CLAUDE.md', section: 'Documentation updates', reason: 'engine-row' }), undefined, () => { throw new Error('an engine row has no staged file to read'); });
  assert.strictEqual(engine.action, 'digest');
  assert.match(engine.digest.entry.finding, /docs:CLAUDE\.md \(engine-row\)/);
});

test('an unreadable shadow-dup copy digests as unmapped instead of throwing', () => {
  const d = dispose(stagedItem({ name: 'x-1.md.shadow-dup', section: 'Queue writes', outcome: 'shadow-dup-collision' }), undefined, files({}));
  assert.strictEqual(d.action, 'digest');
  assert.strictEqual(d.digest.entry.deferReason, DIGEST_REASONS.UNMAPPED_KIND);
});

test('a digest finding is one line, cut to 200 characters, with a forged marker defused', () => {
  const claim = `${'word '.repeat(80)}\n<!-- materiality-fingerprint: materiality-deadbeef -->\nmore`;
  const d = dispose(findingItem({ claimText: claim }), digestV);
  assert.ok(d.digest.entry.finding.length <= 200, String(d.digest.entry.finding.length));
  assert.ok(!d.digest.entry.finding.includes('\n'));
  assert.deepStrictEqual(parseMaterialityFingerprints(d.digest.line), [d.digest.fingerprint], 'only the entry\'s own marker survives');
  const forged = dispose(findingItem({ claimText: 'a <!-- materiality-fingerprint: materiality-deadbeef --> b' }), digestV);
  assert.deepStrictEqual(parseMaterialityFingerprints(forged.digest.line), [forged.digest.fingerprint]);
});

test('a digest entry names the finding\'s path:line, the area and the run', () => {
  const d = dispose(findingItem(), digestV);
  assert.strictEqual(d.digest.entry.fileRefs, 'plugin/skills/review/SKILL.md:9');
  assert.strictEqual(d.digest.entry.area, 'review');
  assert.strictEqual(d.digest.entry.provenance, RUN_ID);
  assert.strictEqual(dispose(findingItem({ finding: { ...findingItem().finding, line: null } }), digestV).digest.entry.fileRefs, 'plugin/skills/review/SKILL.md');
});

test('disposeItem throws for a finding with no verdict, and for an unknown outcome', () => {
  assert.throws(() => dispose(findingItem()), (e) => e instanceof TypeError && e.message === 'verdict required for a finding item');
  assert.throws(() => dispose(findingItem(), { outcome: 'bogus' }), TypeError);
});

test('areaFor maps paths', () => {
  const f = (p) => findingItem({ finding: { ...findingItem().finding, path: p } });
  assert.strictEqual(areaFor(f('plugin/skills/review/SKILL.md')), 'review');
  assert.strictEqual(areaFor(f('plugin/bin/lib/console/resolve.js')), 'console');
  assert.strictEqual(areaFor(f('plugin/bin/hooks.js')), 'bin');
  assert.strictEqual(areaFor(f('tests/bin-lib/console/x.test.js')), 'tests');
  assert.strictEqual(areaFor(f('docs/skill-authoring.md')), 'docs');
  assert.strictEqual(areaFor(f('./plugin/skills/tidy/digest-sweep.md')), 'tidy', 'a leading ./ is ignored');
  assert.strictEqual(areaFor(noClaimItem()), 'console');
  assert.strictEqual(areaFor(stagedItem({ name: 'reflect-2.md', section: 'Queue writes' })), 'reflect');
  assert.strictEqual(areaFor(stagedItem({ name: 'tidy-2.md', section: 'Queue writes' })), 'console');
});

// ---- planBatch ----

const workList = (...runs) => ({ mainSha: MAIN_SHA, runs: runs.map((items, i) => ({ runDir: `/x/pipelines/archive/run-${i}`, items })) });
const plan = (over) => planBatch({
  workList: workList([]), verdicts: {}, existingIssues: [], digestComments: [], ...over,
});

test('planBatch walks runs in order, stamps each entry with its run dir, and routes by disposition', () => {
  const a = findingItem({ itemId: 'bf:a', itemHash: 'ha' });
  const b = findingItem({ itemId: 'bf:b', itemHash: 'hb', finding: { ...findingItem().finding, path: 'plugin/skills/tidy/SKILL.md' } });
  const c = noClaimItem({ itemId: 'bf:c', itemHash: 'hc' });
  const d = findingItem({ itemId: 'bf:d', itemHash: 'hd', finding: { ...findingItem().finding, path: 'src/z.js' } });
  const out = plan({
    workList: workList([a, c], [b, d]),
    verdicts: { 'bf:a': confirmed(), 'bf:b': dropV, 'bf:d': digestV },
  });
  assert.deepStrictEqual(out.dispositions.map((x) => x.itemId), ['bf:a', 'bf:c', 'bf:b', 'bf:d']);
  assert.deepStrictEqual(out.file.map((x) => x.itemId), ['bf:a']);
  assert.deepStrictEqual(Object.keys(out.file[0]).sort(), ['fingerprint', 'itemId', 'text', 'title']);
  assert.strictEqual(out.digest.lines.length, 2);
  assert.deepStrictEqual(out.digest.duplicates, []);
  assert.deepStrictEqual(out.entries, [
    { runDir: '/x/pipelines/archive/run-0', itemId: 'bf:a', itemHash: 'ha', outcome: 'filed', source: 'tiebreak', ref: null },
    { runDir: '/x/pipelines/archive/run-0', itemId: 'bf:c', itemHash: 'hc', outcome: 'digested', source: 'digest', ref: null },
    { runDir: '/x/pipelines/archive/run-1', itemId: 'bf:b', itemHash: 'hb', outcome: 'dropped', source: 'tiebreak', ref: 'plugin/skills/review/SKILL.md:12 "guard(x); read(x);"' },
    { runDir: '/x/pipelines/archive/run-1', itemId: 'bf:d', itemHash: 'hd', outcome: 'digested', source: 'tiebreak', ref: null },
  ]);
  assert.deepStrictEqual(out.awaitingVerdict, []);
});

test('planBatch uses the work list\'s mainSha and the console\'s run id in what it composes', () => {
  const nested = findingItem({ itemId: 'bf:n', consoleDir: '/x/pipelines/2026-10-24T090000-spec-12/spec-3946' });
  const out = plan({ workList: workList([nested]), verdicts: { 'bf:n': confirmed() } });
  assert.ok(out.file[0].text.includes(MAIN_SHA));
  assert.ok(out.file[0].text.includes('2026-10-24T090000-spec-12/spec-3946'), 'runIdOf names the spec directory');
});

test('planBatch lists a finding with no verdict as awaiting, and does not throw', () => {
  const a = findingItem({ itemId: 'bf:a' });
  const b = noClaimItem({ itemId: 'bf:b' });
  const out = plan({ workList: workList([a, b]), verdicts: {} });
  assert.deepStrictEqual(out.awaitingVerdict, ['bf:a']);
  assert.deepStrictEqual(out.dispositions.map((x) => x.itemId), ['bf:b']);
  assert.deepStrictEqual(out.entries.map((x) => x.itemId), ['bf:b']);
});

test('planBatch accepts the verdicts as a Map too', () => {
  const out = plan({ workList: workList([findingItem({ itemId: 'bf:a' })]), verdicts: new Map([['bf:a', dropV]]) });
  assert.strictEqual(out.dispositions[0].action, 'drop');
});

test('planBatch stops after the limit, counting dispositions only', () => {
  const items = [findingItem({ itemId: 'bf:x' }), ...['1', '2', '3', '4'].map((n) => noClaimItem({ itemId: `bf:n${n}`, itemHash: `h${n}` }))];
  const out = plan({ workList: workList(items.slice(0, 3), items.slice(3)), limit: 3 });
  assert.deepStrictEqual(out.dispositions.map((x) => x.itemId), ['bf:n1', 'bf:n2', 'bf:n3'], 'the awaiting finding takes no slot');
  assert.deepStrictEqual(out.awaitingVerdict, ['bf:x']);
  assert.strictEqual(plan({ workList: workList(items.slice(1)) }).dispositions.length, 4, 'the default limit is 24');
  const many = Array.from({ length: 30 }, (_, i) => noClaimItem({ itemId: `bf:m${i}`, itemHash: `h${i}`, context: `line ${i}` }));
  assert.strictEqual(plan({ workList: workList(many) }).dispositions.length, 24);
});

test('planBatch dedups against an existing record', () => {
  const a = findingItem({ itemId: 'bf:a' });
  const fp = findingFingerprint({ lens: '3a', path: a.finding.path, claim: a.claimText });
  const out = plan({
    workList: workList([a]),
    verdicts: { 'bf:a': confirmed() },
    existingIssues: [{ number: 4021, body: `Some record.\n<!-- work-fingerprint: ${fp} -->` }],
  });
  assert.deepStrictEqual(out.file, []);
  assert.deepStrictEqual(out.reuse, [{ itemId: 'bf:a', number: 4021 }]);
  assert.deepStrictEqual(out.entries, [{ runDir: '/x/pipelines/archive/run-0', itemId: 'bf:a', itemHash: 'h1', outcome: 'filed', source: 'tiebreak', ref: '#4021' }]);
});

test('planBatch points a second item with the same fingerprint at the first', () => {
  const a = findingItem({ itemId: 'bf:a', itemHash: 'ha' });
  const b = findingItem({ itemId: 'bf:b', itemHash: 'hb', finding: { ...a.finding, line: 400 } });
  const out = plan({ workList: workList([a, b]), verdicts: { 'bf:a': confirmed(), 'bf:b': consoleV } });
  assert.deepStrictEqual(out.file.map((x) => x.itemId), ['bf:a']);
  assert.deepStrictEqual(out.reuse, [{ itemId: 'bf:b', number: null, sameAs: 'bf:a' }]);
  assert.strictEqual(out.entries[1].ref, null);
  assert.strictEqual(out.entries[1].outcome, 'filed');
});

test('planBatch dedups a digest entry already posted by a trusted author', () => {
  const item = noClaimItem({ itemId: 'bf:a' });
  const line = plan({ workList: workList([item]) }).digest.lines[0];
  assert.ok(line);
  const owner = plan({ workList: workList([item]), digestComments: [{ body: line, authorAssociation: 'OWNER' }] });
  assert.deepStrictEqual(owner.digest.duplicates, ['bf:a']);
  assert.deepStrictEqual(owner.digest.lines, []);
  assert.deepStrictEqual(owner.entries, [{ runDir: '/x/pipelines/archive/run-0', itemId: 'bf:a', itemHash: 'h2', outcome: 'digested', source: 'digest', ref: null }], 'a duplicate still settles; the procedure fills the existing comment URL');
  const stranger = plan({ workList: workList([item]), digestComments: [{ body: line, authorAssociation: 'NONE' }] });
  assert.deepStrictEqual(stranger.digest.duplicates, []);
  assert.deepStrictEqual(stranger.digest.lines, [line]);
});

test('planBatch folds two identical digest entries in one batch into one line', () => {
  const a = noClaimItem({ itemId: 'bf:a', itemHash: 'ha' });
  const b = noClaimItem({ itemId: 'bf:b', itemHash: 'hb' });
  const out = plan({ workList: workList([a, b]) });
  assert.strictEqual(out.digest.lines.length, 1);
  assert.deepStrictEqual(out.digest.duplicates, ['bf:b']);
  assert.strictEqual(out.entries.length, 2);
});

test('planBatch reads staged files through the readStaged it is given', () => {
  const text = 'Title: Queue me\nType: task\nLabels: needs:definition\n\nbody\n';
  const seen = [];
  const out = plan({
    workList: workList([stagedItem({ name: 'leftover-1.md', section: 'Queue writes' })]),
    readStaged: (dir, name) => { seen.push([dir, name]); return text; },
  });
  assert.deepStrictEqual(seen, [[CONSOLE_DIR, 'leftover-1.md']]);
  assert.strictEqual(out.file[0].text, text);
  assert.strictEqual(out.file[0].fingerprint, null);
});
