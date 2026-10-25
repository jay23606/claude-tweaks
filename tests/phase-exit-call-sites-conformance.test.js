'use strict';
// tests/phase-exit-call-sites-conformance.test.js — #4026: every pipeline phase exit is one
// `bin/phase-exit.js` call (push, bookkeeping backfill, checklist flip and merge-state read in
// one process), and the CLIs that log their own decisions.md entries are named once, in
// `_shared/auto-decision-log.md`. Reads the live skill prose: the call sites and the envelope
// routing list are the declared contract the CLI is driven by, and a new phase exit that
// restates the old push / pr-checklist.js / pr-merge-state.js sequence must go red here.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readText } = require('./helpers/read-skill');

const ROOT = path.join(__dirname, '..');
const read = (rel) => readText(path.join(ROOT, rel));
const collapse = (s) => s.replace(/\s+/g, ' ');

const PHASE_EXIT_LABEL = '**Phase exit (`worktree` mode';
const SITES = [
  { file: 'plugin/skills/build/SKILL.md', anchor: PHASE_EXIT_LABEL, phase: 'build' },
  { file: 'plugin/skills/test/SKILL.md', anchor: PHASE_EXIT_LABEL, phase: 'test' },
  { file: 'plugin/skills/review/code-mode-steps.md', anchor: PHASE_EXIT_LABEL, phase: 'review' },
  { file: 'plugin/skills/flow/steps-and-gates.md', anchor: PHASE_EXIT_LABEL, phase: 'polish' },
  { file: 'plugin/skills/wrap-up/execution-and-verification.md', anchor: PHASE_EXIT_LABEL, phase: 'wrap-up' },
  { file: 'plugin/skills/flow/multispec-parallel-waves.md', anchor: "Once the wave's last member has merged", phase: 'build' },
];
const BANNED = ['push origin', 'bin/pr-checklist.js', 'bin/pr-merge-state.js'];
const CITES = ['_shared/git-discipline.md', '_shared/pr-checklist-refresh.md'];

// The phase-exit paragraph: from its (unique) anchor to the next blank line or list item.
function phaseExitUnit(text, site) {
  const start = text.indexOf(site.anchor);
  assert.notEqual(start, -1, `${site.file}: phase-exit anchor ${JSON.stringify(site.anchor)} not found`);
  assert.equal(text.indexOf(site.anchor, start + 1), -1, `${site.file}: the phase-exit anchor must be unique`);
  const rest = text.slice(start);
  const end = rest.slice(1).search(/\n[ \t]*\n|\n[ \t]*(?:[-*]|\d+\.) /);
  return collapse(end === -1 ? rest : rest.slice(0, end + 1));
}

// Shared by the positive tests and every go-red control below.
function assertPhaseExitSite(text, site) {
  const unit = phaseExitUnit(text, site);
  const calls = unit.split('bin/phase-exit.js" --run').length - 1;
  assert.equal(calls, 1, `${site.file}: names exactly one bin/phase-exit.js" --run invocation (found ${calls})`);
  assert.match(
    unit,
    new RegExp(`bin/phase-exit\\.js" --run "[^"]+" --phase ${site.phase} --worktree "[^"]+"`),
    `${site.file}: the invocation passes --phase ${site.phase} and --worktree`,
  );
  for (const banned of BANNED) {
    assert.ok(!unit.includes(banned), `${site.file}: no separate ${banned} invocation in the phase-exit paragraph`);
  }
  for (const cite of CITES) assert.ok(unit.includes(cite), `${site.file}: the phase-exit paragraph cites ${cite}`);
}

for (const site of SITES) {
  test(`AC2.1: every phase-exit call site names one phase-exit.js invocation — ${site.file} (--phase ${site.phase})`, () => {
    assertPhaseExitSite(read(site.file), site);
  });
}

test('AC2.1 go-red control: deleting the invocation from one call site makes the shared assertion throw', () => {
  const site = SITES[2];
  const original = read(site.file);
  const mutated = original.replace(/`node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/phase-exit\.js" --run [^`]*`/, 'the phase exit');
  assert.notEqual(mutated, original, 'the control must actually remove the invocation');
  assert.throws(() => assertPhaseExitSite(mutated, site), { message: /names exactly one bin\/phase-exit\.js" --run invocation \(found 0\)/ });
});

test('AC2.1 go-red control: a separate pr-checklist.js call, a push, or the wrong --phase makes the shared assertion throw', () => {
  const site = SITES[1];
  const original = read(site.file);
  const at = original.indexOf(site.anchor);
  const withChecklist = `${original.slice(0, at)}${site.anchor} then \`node "\${CLAUDE_PLUGIN_ROOT}/bin/pr-checklist.js" --run "{run-dir}" --phase test\`${original.slice(at + site.anchor.length)}`;
  assert.notEqual(withChecklist, original);
  assert.throws(() => assertPhaseExitSite(withChecklist, site), { message: /no separate bin\/pr-checklist\.js invocation/ });
  const withPush = `${original.slice(0, at)}${site.anchor} \`git -C "{worktree-path}" push origin {branch}\`${original.slice(at + site.anchor.length)}`;
  assert.throws(() => assertPhaseExitSite(withPush, site), { message: /no separate push origin invocation/ });
  const wrongPhase = original.replace('--phase test --worktree', '--phase review --worktree');
  assert.notEqual(wrongPhase, original, 'the control must actually change the --phase value');
  assert.throws(() => assertPhaseExitSite(wrongPhase, site), { message: /passes --phase test and --worktree/ });
});

test('AC2.1 go-red control: the paragraph unit stops at the next blank line, so a later paragraph never satisfies it', () => {
  const site = { file: 'fixture.md', anchor: PHASE_EXIT_LABEL, phase: 'test' };
  const fixture = `${PHASE_EXIT_LABEL} push the branch.\n\nLater: \`node "\${CLAUDE_PLUGIN_ROOT}/bin/phase-exit.js" --run "$PIPELINE_RUN_DIR" --phase test --worktree "{worktree-path}"\` per _shared/git-discipline.md and _shared/pr-checklist-refresh.md.\n`;
  assert.throws(() => assertPhaseExitSite(fixture, site), { message: /\(found 0\)/ });
  assert.doesNotThrow(() => assertPhaseExitSite(fixture.replace('push the branch.\n\nLater:', 'push the branch. Later:'), site));
});

// --- missing-facts predicates: each fact is proved to go red on its own ---

function missingFacts(text, facts) {
  const flat = collapse(text);
  return facts.filter((f) => !f.re.test(flat)).map((f) => f.name);
}

function assertEachFactGoesRed(text, facts) {
  const flat = collapse(text);
  for (const f of facts) {
    const stripped = flat.replace(f.re, '');
    assert.notEqual(stripped, flat, `${f.name}: the strip must remove something`);
    assert.deepEqual(missingFacts(stripped, facts), [f.name], `${f.name}: stripping its match must report exactly itself`);
  }
}

const AUTO_DECISION_LOG = read('plugin/skills/_shared/auto-decision-log.md');
const LOG_FACTS = [
  { name: 'entries form', re: /`bin\/log-decision\.js --run <run-dir> --entries <file> \[--section "\/<skill>"\]` appends many entries under one lock/ },
  { name: 'batch at phase end', re: /Batch the model-judged entries a phase accumulates into one `--entries` call at phase end, before its `bin\/phase-exit\.js` call/ },
  { name: 'session-tmp path', re: /bin\/session-tmp-resolve\.js" DECISION_ENTRIES=decision-entries-\{run-id\}-\{phase\}\.json/ },
  { name: 'Write tool, never the shell', re: /write the JSON with the Write tool — never through the shell/ },
  { name: 'CLIs self-log', re: /A bin CLI given `--run` appends the entry for a decision it reports as data itself, through `lib\/log-decision\/append\.js`/ },
  { name: 'never re-log', re: /A skill never re-logs an entry a CLI already wrote/ },
  { name: 'hand-log only on a failed append', re: /hand-logs it with `log-decision\.js` only when the CLI reports the append failed: `logged: false` on a state that logs, `logFailed: true`, a `logFailures` element/ },
  { name: '(a) failed invocation', re: /\(a\) an entry reporting a CLI's own failed invocation/ },
  { name: '(b) before the run dir exists', re: /\(b\) a CLI that runs before the run directory exists \(`preflight-records\.js`\)/ },
  { name: '(c) read-only fact pack', re: /\(c\) a read-only fact pack \(`flow-preflight\.js`, `wrap-up-pack\.js`\)/ },
  { name: '(d) many-site resolver', re: /\(d\) a resolver called from many sites where no entry is owed \(`resolve-policy\.js`, `resolve-profile\.js`\)/ },
  { name: '(e) caller retry state', re: /\(e\) an entry whose text depends on the caller's own retry state/ },
  { name: '(f) node -e lib module', re: /\(f\) a lib module run through `node -e`, which is not a bin CLI/ },
];

test('auto-decision-log.md documents --entries and the self-logging rule', () => {
  assert.deepEqual(missingFacts(AUTO_DECISION_LOG, LOG_FACTS), []);
});

test('go-red control: each --entries / self-logging fact goes red on its own', () => {
  assertEachFactGoesRed(AUTO_DECISION_LOG, LOG_FACTS);
});

const GIT_DISCIPLINE = read('plugin/skills/_shared/git-discipline.md');
const phaseExitSection = (text) => {
  const start = text.indexOf('## Phase-exit push (`integration-model: pr-first` only)');
  const end = text.indexOf('### Post-push merge-state check');
  assert.ok(start !== -1 && end > start, 'the Phase-exit push section precedes the Post-push merge-state check');
  return text.slice(start, end);
};
const ROUTING_FACTS = [
  { name: 'the one invocation', re: /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/phase-exit\.js" --run "\$PIPELINE_RUN_DIR" --phase \{build\|test\|review\|polish\|wrap-up\} --worktree "\{worktree-path\}" --fixes \{n\}\[,\{m\}\.\.\.\]/ },
  { name: 'call sites cite the list', re: /every call site cites this list rather than restating it/ },
  { name: 'pushed routes mergeState', re: /`push\.state: 'pushed'` — route `mergeState` per the Post-push merge-state check below/ },
  { name: 'failed push needs nothing', re: /`push\.state: 'failed'` — nothing: the CLI logged it, and the next phase exit's push retries/ },
  { name: 'no recorded PR opens it, then re-runs', re: /`push\.state: 'skipped'` with a `reason` naming no recorded PR — run `_shared\/pr-early-run-lifecycle\.md`'s push-and-open-draft-PR procedure, then re-run `phase-exit\.js`/ },
  { name: 'failed worktree stamp runs record-worktree by hand', re: /`bookkeeping\.worktree: 'failed'` on a live run dir — run `record-worktree` by hand \(`build\/worktree-setup\.md` Step 4\.5\), then re-run `phase-exit\.js`/ },
  { name: 'checklist no-pr / gh-absent', re: /`checklist\.action: 'no-pr'` — `_shared\/pr-checklist-refresh\.md`'s degraded-run recovery; `'gh-absent'` — its MCP branch/ },
  { name: 'logFailures hand-logged', re: /`logFailures` — hand-log each `decision` element/ },
  { name: 'local-merge / current-branch need nothing', re: /`route` `local-merge` or `current-branch` — nothing more/ },
  { name: 'parallel-wave members never call it', re: /Under `MULTISPEC_PARALLEL_WAVE=1` a member never calls it: write one `SKIP` entry naming the marker instead/ },
];

test('git-discipline.md: the Phase-exit push section is the one phase-exit.js call and routes every envelope branch', () => {
  assert.deepEqual(missingFacts(phaseExitSection(GIT_DISCIPLINE), ROUTING_FACTS), []);
});

test('go-red control: each envelope-routing fact goes red on its own', () => {
  assertEachFactGoesRed(phaseExitSection(GIT_DISCIPLINE), ROUTING_FACTS);
});
