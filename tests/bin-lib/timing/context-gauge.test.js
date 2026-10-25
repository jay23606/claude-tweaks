'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CONTEXT_CAP_TOKENS, findAgentTranscript, gauge, resolveTargetRecords } = require('../../../plugin/bin/lib/timing/context-gauge');
const { slugForCwd } = require('../../../plugin/bin/lib/timing/transcript');
const { run } = require('../../../plugin/bin/context-gauge');
const { gitRepo, harnessWorktreeOf } = require('../../helpers/git-fixtures');

// The developer's own CLAUDE_CONFIG_DIR must never redirect a lookup away from
// its fixture (#3458) — every lookup below passes its configDir explicitly.
delete process.env.CLAUDE_CONFIG_DIR;

// Trimmed from a real dispatched build+test call's subagent transcript
// (record #4151's run, Claude Code 2.1.302, observed 2026-10-25): the first
// user message plus the last 3 assistant turns and the tool_result lines
// between them, every text field redacted, cwd/gitBranch replaced. Its run id
// survives in the redacted prompt so identification can be probed on it too.
const REAL = path.join(__dirname, '..', '..', 'fixtures', 'context-gauge', 'dispatched-call-real.jsonl');
const REAL_RUN_ID = '2026-10-25T144531-record-4151';

const RUN_ID = '2026-10-25T162129-record-4027';
const SID = '0f3c9d2e-1b7a-4c55-9e21-7d4f0a6b8c13';
const CWD = '/Users/x/Code/repo/.claude/worktrees/wt';
const NOW = Date.parse('2026-10-25T18:00:00.000Z');

const created = [];
test.after(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  created.push(d);
  return d;
}

const userLine = (content, ts = '2026-10-25T17:00:00.000Z') => JSON.stringify({ type: 'user', timestamp: ts, message: { role: 'user', content } });
// One assistant turn as Claude Code writes a subagent's: a streaming snapshot
// line, then the settled line, both under one message.id.
function turnLines(id, { input = 2, cacheRead = 0, cacheCreate = 0 }, ts = '2026-10-25T17:01:00.000Z') {
  const usage = (out) => ({ input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreate, output_tokens: out });
  return [
    JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '' }], stop_reason: null, usage: usage(8) } }),
    JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: usage(400) } }),
  ];
}
const transcriptText = (lines) => `${lines.join('\n')}\n`;

// {configDir}/projects/{slug}/{sid}.jsonl + {sid}/subagents/, as observed.
function store({ main = true } = {}) {
  const configDir = tmp('ct-gauge-config-');
  const slugDir = path.join(configDir, 'projects', slugForCwd(CWD));
  const subagents = path.join(slugDir, SID, 'subagents');
  fs.mkdirSync(subagents, { recursive: true });
  const mainPath = path.join(slugDir, `${SID}.jsonl`);
  if (main) fs.writeFileSync(mainPath, transcriptText([userLine('top-level prompt'), ...turnLines('msg_main', { cacheRead: 90000 })]));
  return { configDir, slugDir, subagents, mainPath };
}

function agent(subagents, id, firstUser, mtimeSec, usage = { cacheRead: 1000 }) {
  const p = path.join(subagents, `agent-${id}.jsonl`);
  fs.writeFileSync(p, transcriptText([userLine(firstUser), ...turnLines(`msg_${id}`, usage)]));
  fs.utimesSync(p, mtimeSec, mtimeSec);
  return p;
}

const dispatchPrompt = (runId) => `Task scope: build+test.\nPIPELINE_RUN_DIR="/m/.claude-tweaks/pipelines/${runId}" /claude-tweaks:flow #4027 build,test auto`;
const find = (s, over = {}) => findAgentTranscript({ runId: RUN_ID, sessionId: SID, cwd: CWD, configDir: s.configDir, ...over });

test('CONTEXT_CAP_TOKENS is the 200k midpoint of #4027\'s measured curve', () => {
  assert.strictEqual(CONTEXT_CAP_TOKENS, 200000);
});

test('findAgentTranscript: of two agent transcripts, the newer whose first user message names the run id is chosen', () => {
  const s = store();
  agent(s.subagents, 'aold', 'an unrelated reviewer prompt', 1000);
  const newer = agent(s.subagents, 'anew', dispatchPrompt(RUN_ID), 2000);
  assert.deepStrictEqual(find(s), { path: newer, kind: 'subagent' });
});

test('findAgentTranscript: the run id decides before recency, and recency decides between two matches', () => {
  const s = store();
  const older = agent(s.subagents, 'aold', dispatchPrompt(RUN_ID), 1000);
  agent(s.subagents, 'anew', 'an unrelated reviewer prompt', 2000);
  assert.deepStrictEqual(find(s), { path: older, kind: 'subagent' }, 'a newer non-match never wins');
  const newest = agent(s.subagents, 'anewest', [{ type: 'text', text: dispatchPrompt(RUN_ID) }], 3000);
  assert.deepStrictEqual(find(s), { path: newest, kind: 'subagent' }, 'array-of-text-blocks content counts too');
});

test('findAgentTranscript: only the FIRST user message counts — a later mention of the run id is not a match', () => {
  const s = store();
  const p = path.join(s.subagents, 'agent-alater.jsonl');
  fs.writeFileSync(p, transcriptText([userLine('an unrelated prompt'), ...turnLines('msg_x', {}), userLine(`later: ${RUN_ID}`)]));
  assert.deepStrictEqual(find(s), { path: s.mainPath, kind: 'main' });
});

test('findAgentTranscript: no matching agent falls back to the main transcript; neither -> null', () => {
  const s = store();
  agent(s.subagents, 'aother', dispatchPrompt('2026-10-24T090000-record-1'), 1000);
  assert.deepStrictEqual(find(s), { path: s.mainPath, kind: 'main' });
  const bare = store({ main: false });
  agent(bare.subagents, 'aother', 'unrelated', 1000);
  assert.strictEqual(find(bare), null);
  assert.strictEqual(find(s, { sessionId: undefined }), null, 'no session id -> nothing to look up');
  assert.strictEqual(find(s, { sessionId: '../escape' }), null, 'a malformed session id is never widened into a scan');
});

test('findAgentTranscript: the main transcript is found by file name when the cwd slug differs', () => {
  const s = store();
  const p = agent(s.subagents, 'anew', dispatchPrompt(RUN_ID), 2000);
  assert.deepStrictEqual(find(s, { cwd: '/somewhere/else' }), { path: p, kind: 'subagent' });
});

test('findAgentTranscript: a symlinked agent transcript is never followed', { skip: process.platform === 'win32' }, () => {
  const s = store();
  const outside = tmp('ct-gauge-outside-');
  const target = path.join(outside, 'agent-evil.jsonl');
  fs.writeFileSync(target, transcriptText([userLine(dispatchPrompt(RUN_ID)), ...turnLines('msg_evil', {})]));
  fs.symlinkSync(target, path.join(s.subagents, 'agent-evil.jsonl'));
  assert.deepStrictEqual(find(s), { path: s.mainPath, kind: 'main' });
});

test('gauge: contextTokens is the last turn\'s input + cache_read + cache_creation', async () => {
  const dir = tmp('ct-gauge-t-');
  const p = path.join(dir, 't.jsonl');
  fs.writeFileSync(p, transcriptText([userLine('x'), ...turnLines('m1', { input: 5, cacheRead: 300000, cacheCreate: 7 }), ...turnLines('m2', { input: 3, cacheRead: 120000, cacheCreate: 4000 })]));
  assert.deepStrictEqual(await gauge({ transcript: p }), { contextTokens: 124003 });
  const empty = path.join(dir, 'e.jsonl');
  fs.writeFileSync(empty, transcriptText([userLine('x')]));
  assert.deepStrictEqual(await gauge({ transcript: empty }), { contextTokens: null });
});

test('real-input probe: a trimmed real dispatched-call transcript measures the hand-computed sum, and is identified by its run id', async () => {
  // Last turn msg_011CgPCW739rrxPGMzX13SBF (two lines, same usage):
  // input_tokens 2 + cache_read_input_tokens 524028 + cache_creation_input_tokens 2221 = 526251.
  assert.deepStrictEqual(await gauge({ transcript: REAL }), { contextTokens: 526251 });
  const s = store();
  agent(s.subagents, 'adecoy', 'an unrelated prompt', 3000);
  const copy = path.join(s.subagents, 'agent-ad659849552e32806.jsonl');
  fs.copyFileSync(REAL, copy);
  fs.utimesSync(copy, 2000, 2000);
  assert.deepStrictEqual(findAgentTranscript({ runId: REAL_RUN_ID, sessionId: SID, cwd: CWD, configDir: s.configDir }), { path: copy, kind: 'subagent' });
});

// A run dir under a real git main checkout, with its worktree recorded in
// run-state.json and the materialized spec committed inside that worktree at
// the run dir's relative path — the single-record layout /flow produces.
function runFixture({ spec = 'worktree', specDirs = [], worktree = true } = {}) {
  const root = gitRepo();
  created.push(root);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(runDir, { recursive: true });
  let wt = null;
  if (worktree) {
    wt = harnessWorktreeOf(root);
    fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ worktree: wt, status: 'active' }));
  }
  if (spec === 'worktree' && wt) {
    fs.mkdirSync(path.join(wt, '.claude-tweaks', 'pipelines', RUN_ID, 'work'), { recursive: true });
    fs.writeFileSync(path.join(wt, '.claude-tweaks', 'pipelines', RUN_ID, 'work', '4027-spec.md'), '# spec\n');
  } else if (spec === 'run-dir') {
    fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
    fs.writeFileSync(path.join(runDir, 'work', '4027-spec.md'), '# spec\n');
  }
  for (const n of specDirs) fs.mkdirSync(path.join(runDir, `spec-${n}`, 'work'), { recursive: true });
  return { root, runDir, wt };
}

function transcriptAt(dir, contextTokens) {
  const p = path.join(dir, 'agent-t.jsonl');
  fs.writeFileSync(p, transcriptText([userLine(dispatchPrompt(RUN_ID)), ...turnLines('m1', { cacheRead: 1000 }), ...turnLines('m2', { input: 2, cacheRead: contextTokens - 2 - 500, cacheCreate: 500 })]));
  return p;
}

function cli(fx, over = {}) {
  const out = []; const err = [];
  const deps = {
    cwd: () => fx.root,
    mainRoot: fx.root,
    env: {},
    now: () => NOW,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    ...over,
  };
  return { out, err, deps, json: () => JSON.parse(out.join('')) };
}

const RESUME = (runDir, target, steps) => `PIPELINE_RUN_DIR="${runDir}" /claude-tweaks:flow "${target}" ${steps} auto`;

test('CLI: 250000 tokens is over the cap — handoff.json is written with nextSteps and the resume line', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0, c.err.join(''));
  const handoffPath = path.join(fx.runDir, 'handoff.json');
  assert.deepStrictEqual(c.json(), { contextTokens: 250000, cap: 200000, over: true, transcript: t, handoff: handoffPath, reason: null });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(handoffPath, 'utf8')), {
    nextSteps: ['test'], contextTokens: 250000, cap: 200000, writtenAt: '2026-10-25T18:00:00.000Z',
    resume: RESUME(fx.runDir, '#4027', 'test'),
  });
  assert.strictEqual(c.out.join('').split('\n').filter(Boolean).length, 1, 'one JSON line');
});

test('CLI: 150000 tokens is under the cap — over: false and no handoff.json', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 150000);
  const c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0);
  assert.deepStrictEqual(c.json(), { contextTokens: 150000, cap: 200000, over: false, transcript: t, handoff: null, reason: null });
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
});

test('CLI: --cap overrides CONTEXT_CAP_TOKENS', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 150000);
  const c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--cap', '100000', '--next-steps', 'review,polish,wrap-up'], c.deps), 0);
  assert.strictEqual(c.json().over, true);
  assert.strictEqual(c.json().cap, 100000);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(fx.runDir, 'handoff.json'), 'utf8')).nextSteps, ['review', 'polish', 'wrap-up']);
});

test('CLI: exactly at the cap is not over it', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 200000);
  const c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0);
  assert.strictEqual(c.json().contextTokens, 200000);
  assert.strictEqual(c.json().over, false);
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
});

test('CLI: over the cap without --next-steps reports over: true and writes nothing', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t], c.deps), 0);
  assert.deepStrictEqual(c.json(), { contextTokens: 250000, cap: 200000, over: true, transcript: t, handoff: null, reason: null });
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
});

test('CLI: discovery through CLAUDE_CODE_SESSION_ID finds the agent transcript naming the run id', async () => {
  const fx = runFixture();
  const s = store();
  agent(s.subagents, 'aold', 'an unrelated prompt', 1000, { cacheRead: 10 });
  const mine = agent(s.subagents, 'anew', dispatchPrompt(RUN_ID), 2000, { input: 2, cacheRead: 249000, cacheCreate: 998 });
  const c = cli(fx, { cwd: () => fx.root, env: { CLAUDE_CODE_SESSION_ID: SID, CLAUDE_CONFIG_DIR: s.configDir } });
  // The run dir's cwd slug is not the store's; the main transcript is found by file name.
  assert.strictEqual(await run(['--run', fx.runDir, '--next-steps', 'test'], c.deps), 0, c.err.join(''));
  assert.strictEqual(c.json().transcript, mine);
  assert.strictEqual(c.json().contextTokens, 250000);
  assert.strictEqual(c.json().over, true);
});

test('CLI: no transcript fails open — over: false, reason names the miss, exit 0, nothing written', async () => {
  const fx = runFixture();
  const empty = tmp('ct-gauge-config-');
  for (const env of [{}, { CLAUDE_CODE_SESSION_ID: SID, CLAUDE_CONFIG_DIR: empty }]) {
    const c = cli(fx, { env });
    assert.strictEqual(await run(['--run', fx.runDir, '--next-steps', 'test'], c.deps), 0);
    const j = c.json();
    assert.strictEqual(j.over, false);
    assert.strictEqual(j.contextTokens, null);
    assert.strictEqual(j.transcript, null);
    assert.strictEqual(j.handoff, null);
    assert.match(j.reason, /^no transcript found/);
  }
  const c = cli(fx);
  await run(['--run', fx.runDir], c.deps);
  assert.match(c.json().reason, /CLAUDE_CODE_SESSION_ID is not set/);
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
});

test('CLI: an unreadable or turnless --transcript fails open with the reason, exit 0', async () => {
  const fx = runFixture();
  const dir = tmp('ct-gauge-cli-');
  const missing = path.join(dir, 'nope.jsonl');
  let c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', missing, '--next-steps', 'test'], c.deps), 0);
  assert.deepStrictEqual(c.json(), { contextTokens: null, cap: 200000, over: false, transcript: missing, handoff: null, reason: `transcript not readable (ENOENT): ${missing}` });
  c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', dir, '--next-steps', 'test'], c.deps), 0);
  assert.match(c.json().reason, /^transcript not readable \(EISDIR\)/);
  const turnless = path.join(dir, 'u.jsonl');
  fs.writeFileSync(turnless, transcriptText([userLine('x')]));
  c = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', turnless, '--next-steps', 'test'], c.deps), 0);
  assert.deepStrictEqual(c.json(), { contextTokens: null, cap: 200000, over: false, transcript: turnless, handoff: null, reason: `transcript has no assistant turn: ${turnless}` });
});

test('CLI: a failed handoff write is reported, never thrown — exit 0, handoff: null', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const c = cli(fx, { writeFile: () => { const e = new Error('EACCES: simulated'); e.code = 'EACCES'; throw e; } });
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0);
  assert.strictEqual(c.json().over, true);
  assert.strictEqual(c.json().handoff, null);
  assert.match(c.json().reason, /^handoff\.json not written: EACCES: simulated/);
});

test('CLI: target records — the run dir\'s work/ when no worktree is recorded; spec-{N}/ dirs for a multi-spec run; none found is reported', async () => {
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const own = runFixture({ spec: 'run-dir', worktree: false });
  let c = cli(own);
  assert.strictEqual(await run(['--run', own.runDir, '--transcript', t, '--next-steps', 'test,review'], c.deps), 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(own.runDir, 'handoff.json'), 'utf8')).resume, RESUME(own.runDir, '#4027', 'test,review'));

  const multi = runFixture({ spec: 'none', specDirs: [3817, 3926, 945] });
  c = cli(multi);
  assert.strictEqual(await run(['--run', multi.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(multi.runDir, 'handoff.json'), 'utf8')).resume, RESUME(multi.runDir, '#945,#3817,#3926', 'test'));

  const none = runFixture({ spec: 'none' });
  c = cli(none);
  assert.strictEqual(await run(['--run', none.runDir, '--transcript', t, '--next-steps', 'test'], c.deps), 0);
  assert.strictEqual(c.json().over, true);
  assert.strictEqual(c.json().handoff, null);
  assert.match(c.json().reason, /^handoff\.json not written: no target records/);
  assert.ok(!fs.readdirSync(none.runDir).includes('handoff.json'));
});

test('resolveTargetRecords: worktree copy first, then the run dir; spec-{N}/ wins over work/', () => {
  const fx = runFixture({ spec: 'worktree' });
  assert.deepStrictEqual(resolveTargetRecords({ runDir: fx.runDir, worktree: fx.wt, gitRoot: fx.root }), ['#4027']);
  assert.strictEqual(resolveTargetRecords({ runDir: fx.runDir, worktree: null, gitRoot: fx.root }), null, 'the run dir itself has no work/ here');
  fs.mkdirSync(path.join(fx.runDir, 'spec-12'));
  fs.writeFileSync(path.join(fx.runDir, 'spec-13'), 'a file, not a spec dir');
  assert.deepStrictEqual(resolveTargetRecords({ runDir: fx.runDir, worktree: fx.wt, gitRoot: fx.root }), ['#12']);
});

test('CLI: malformed invocations exit 2 and write nothing', async () => {
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const cases = [
    [],
    ['--run'],
    ['--run', ''],
    ['--run', fx.runDir, '--cap'],
    ['--run', fx.runDir, '--cap', '0'],
    ['--run', fx.runDir, '--cap', '-5'],
    ['--run', fx.runDir, '--cap', '12k'],
    ['--run', fx.runDir, '--next-steps'],
    ['--run', fx.runDir, '--next-steps', ''],
    ['--run', fx.runDir, '--next-steps', '--cap'],
    ['--run', fx.runDir, '--next-steps', 'tset'],
    ['--run', fx.runDir, '--next-steps', 'test,,review'],
    ['--run', fx.runDir, '--next-steps', 'test,'],
    ['--run', fx.runDir, '--next-steps', 'Test'],
    ['--run', fx.runDir, '--transcript'],
    ['--run', fx.runDir, '--bogus', 'x'],
    ['--run', fx.runDir, 'constructor'],
    ['--run', path.join(fx.runDir, 'nope')],
    ['--run', path.join(fx.root, '.claude-tweaks')],
  ];
  for (const argv of cases) {
    const c = cli(fx);
    assert.strictEqual(await run(argv, c.deps), 2, JSON.stringify(argv));
    assert.strictEqual(c.out.join(''), '', JSON.stringify(argv));
  }
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
  // a well-formed call on the same fixture still succeeds (the cases above are not all-red by accident)
  const ok = cli(fx);
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'review-console'], ok.deps), 0);
});

test('CLI: --run is anchored strictly — outside every checkout and a worktree-local shadow both exit 2', async () => {
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const outside = tmp('ct-gauge-outside-');
  const outRun = path.join(outside, '.claude-tweaks', 'pipelines', RUN_ID);
  fs.mkdirSync(outRun, { recursive: true });
  for (const mainRoot of [undefined, gitRepo()]) {
    if (mainRoot) created.push(mainRoot);
    const c = cli({ root: outside }, { mainRoot });
    assert.strictEqual(await run(['--run', outRun, '--transcript', t, '--next-steps', 'test'], c.deps), 2, String(mainRoot));
    assert.match(c.err.join(''), /not anchored under the main checkout/);
    assert.deepStrictEqual(fs.readdirSync(outRun), []);
  }
  const fx = runFixture();
  // A real run dir of ANOTHER main checkout than the injected mainRoot is refused too.
  const otherMain = gitRepo();
  created.push(otherMain);
  const foreign = cli(fx, { mainRoot: otherMain });
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], foreign.deps), 2);
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
  const shadow = path.join(fx.wt, '.claude-tweaks', 'pipelines', RUN_ID);
  const before = fs.readdirSync(shadow).sort();
  const c = cli(fx, { cwd: () => fx.wt, mainRoot: undefined });
  assert.strictEqual(await run(['--run', shadow, '--transcript', t, '--next-steps', 'test'], c.deps), 2);
  assert.deepStrictEqual(fs.readdirSync(shadow).sort(), before, 'the shadow is untouched');
  // The same call against the main-checkout run dir, from the worktree cwd, is accepted.
  const ok = cli(fx, { cwd: () => fx.wt, mainRoot: undefined });
  assert.strictEqual(await run(['--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], ok.deps), 0, ok.err.join(''));
  assert.strictEqual(ok.json().handoff, path.join(fx.runDir, 'handoff.json'));
});

test('CLI: a --run whose basename is not a run id exits 2', async () => {
  const fx = runFixture({ specDirs: [12] });
  const c = cli(fx);
  assert.strictEqual(await run(['--run', path.join(fx.runDir, 'spec-12'), '--next-steps', 'test'], c.deps), 2);
  assert.match(c.err.join(''), /not a run id/);
});

test('the real binary: exit 0 with one JSON line on a measured call, exit 2 on a malformed one', () => {
  const { spawnSync } = require('child_process');
  const BIN = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'context-gauge.js');
  const fx = runFixture();
  const t = transcriptAt(tmp('ct-gauge-cli-'), 250000);
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  const ok = spawnSync(process.execPath, [BIN, '--run', fx.runDir, '--transcript', t, '--next-steps', 'test'], { cwd: fx.root, env, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.strictEqual(JSON.parse(ok.stdout).handoff, path.join(fx.runDir, 'handoff.json'));
  const bad = spawnSync(process.execPath, [BIN, '--run', fx.runDir, '--cap', 'zero'], { cwd: fx.root, env, encoding: 'utf8', windowsHide: true });
  assert.strictEqual(bad.status, 2);
  assert.strictEqual(bad.stdout, '');
});

test('CLI: --help prints usage and exits 0 without touching anything', async () => {
  const fx = runFixture();
  const c = cli(fx);
  assert.strictEqual(await run(['--help'], c.deps), 0);
  assert.match(c.out.join(''), /^usage: context-gauge\.js --run <run-dir>/);
  assert.ok(!fs.readdirSync(fx.runDir).includes('handoff.json'));
});
