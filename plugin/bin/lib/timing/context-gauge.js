// bin/lib/timing/context-gauge.js — measure the running agent's own context
// from its transcript, and name the records a handoff resumes (#4027
// Deliverable 3). bin/context-gauge.js is the CLI; /flow calls it at a phase
// boundary, and past the cap the next phase starts in a fresh agent from
// {run}/handoff.json instead of growing this one's context.
//
// Transcript layout (observed on Claude Code 2.1.302, 2026-10-25 — not a
// documented contract, see transcript.js's header): a dispatched Task agent's
// transcript is {configDir}/projects/{slug}/{sessionId}/subagents/agent-{id}.jsonl,
// beside the session's main {sessionId}.jsonl, where {slug} follows the
// dispatcher's cwd at dispatch time. Inside the agent's Bash,
// CLAUDE_CODE_SESSION_ID is the PARENT session's id, and nothing names the
// agent's own id or transcript path — so the agent is identified by its first
// user message (its dispatch prompt), which names the run dir. Non-message
// lines (attachment, api-request-shape, api-request, and api-request-blob,
// which carries a message.role but no timestamp) are skipped by the same
// filter readUsage applies.
'use strict';
const fs = require('fs');
const path = require('path');
const { lstatType } = require('../path-guard');
const { isPathContained } = require('../shared-primitives');
const { locateTranscripts, subagentsDirFor, readUsage } = require('./transcript');

// #4027's measured latency curve: 5.0 s per turn under 100k context and
// 12.1 s per turn above 300k, so 200k — the midpoint — is the cap.
const CONTEXT_CAP_TOKENS = 200000;

// The first user message is the transcript's first line in every observed
// subagent transcript; the cap bounds the read when it is not.
const FIRST_USER_SCAN_BYTES = 4 * 1024 * 1024;
const SCAN_CHUNK_BYTES = 64 * 1024;

// JSONL line -> the user message's text, or undefined when the line is not a
// timestamped user message. A string content is the text; an array content
// contributes its text blocks.
function userTextOf(line) {
  let entry;
  try { entry = JSON.parse(line); } catch { return undefined; }
  const msg = entry && entry.message;
  if (!entry || typeof entry.timestamp !== 'string' || !msg || msg.role !== 'user') return undefined;
  if (typeof msg.content === 'string') return msg.content;
  if (!Array.isArray(msg.content)) return '';
  return msg.content.map((b) => (b && b.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('\n');
}

// path -> the text of the transcript's first user message, or null (no user
// message within FIRST_USER_SCAN_BYTES, or unreadable). Reads only as far as
// that message, since a session's subagents/ can hold many large transcripts.
function firstUserText(filePath, { fsImpl = fs, maxBytes = FIRST_USER_SCAN_BYTES } = {}) {
  let fd;
  try { fd = fsImpl.openSync(filePath, 'r'); } catch { return null; }
  try {
    const chunk = Buffer.alloc(SCAN_CHUNK_BYTES);
    let pending = Buffer.alloc(0);
    let total = 0;
    for (;;) {
      const want = Math.min(SCAN_CHUNK_BYTES, maxBytes - total);
      const n = want > 0 ? fsImpl.readSync(fd, chunk, 0, want, null) : 0;
      total += n;
      if (n > 0) pending = Buffer.concat([pending, chunk.subarray(0, n)]);
      let nl;
      while ((nl = pending.indexOf(10)) !== -1) {
        const text = userTextOf(pending.subarray(0, nl).toString('utf8'));
        if (text !== undefined) return text;
        pending = pending.subarray(nl + 1);
      }
      if (n === 0) {
        // EOF: an unterminated last line still counts; at the cap it is cut.
        if (want > 0 && pending.length) {
          const text = userTextOf(pending.toString('utf8'));
          if (text !== undefined) return text;
        }
        return null;
      }
    }
  } catch {
    return null;
  } finally {
    try { fsImpl.closeSync(fd); } catch { /* best-effort */ }
  }
}

// subagents dir -> [{ path, mtimeMs }] of its regular agent-*.jsonl files. A
// symlinked session dir, subagents/ dir or agent file is never followed (the
// lstat twin of locateTranscripts' realpath containment, IL-150).
function agentTranscripts(dir, fsImpl) {
  if (lstatType(path.dirname(dir), { fsImpl }).type !== 'directory') return [];
  if (lstatType(dir, { fsImpl }).type !== 'directory') return [];
  let names;
  try { names = fsImpl.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!/^agent-.+\.jsonl$/.test(n)) continue;
    const p = path.join(dir, n);
    if (lstatType(p, { fsImpl }).type !== 'file') continue;
    try { out.push({ path: p, mtimeMs: fsImpl.statSync(p).mtimeMs }); } catch { /* vanished: skip */ }
  }
  return out;
}

// { runId, sessionId, cwd?, configDir?, fsImpl? } -> { path, kind: 'subagent' | 'main' } | null.
// The newest agent-*.jsonl in the session's subagents/ whose first user
// message contains runId; else the session's main transcript; else null. The
// main transcript is found by file name across every project slug
// (locateTranscripts with the session id alone), so a cwd that no longer
// matches the slug still finds it; the cwd's own slug is preferred when a
// session id appears under several. configDir undefined means
// locateTranscripts' default ($CLAUDE_CONFIG_DIR, else ~/.claude).
function findAgentTranscript({ runId, sessionId, cwd, configDir, fsImpl = fs } = {}) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const mains = locateTranscripts({ sessionId, configDir, fsImpl });
  if (mains.length === 0) return null;
  if (typeof runId === 'string' && runId) {
    const dirs = [...new Set(mains.map((m) => subagentsDirFor(m.path)))];
    const agents = dirs.flatMap((d) => agentTranscripts(d, fsImpl)).sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const a of agents) {
      const text = firstUserText(a.path, { fsImpl });
      if (typeof text === 'string' && text.includes(runId)) return { path: a.path, kind: 'subagent' };
    }
  }
  const here = cwd ? locateTranscripts({ cwd, sessionId, configDir, fsImpl }) : [];
  return { path: (here[0] || mains[0]).path, kind: 'main' };
}

// { transcript, fsImpl? } -> Promise<{ contextTokens }>: the contextTokens of
// the last turnStart row (input + cache_read + cache_creation, per-message.id
// max — readUsage's), or null when the transcript has no assistant turn.
// Rejects as readUsage does when the file cannot be read.
async function gauge({ transcript, fsImpl = fs } = {}) {
  const rows = await readUsage(transcript, { fsImpl });
  let last = null;
  for (const r of rows) if (r.turnStart) last = r;
  return { contextTokens: last ? last.contextTokens : null };
}

function numberedEntries(dir, re, wantType, fsImpl) {
  let names;
  try { names = fsImpl.readdirSync(dir); } catch { return []; }
  const out = [];
  for (const n of names) {
    const m = re.exec(n);
    if (m && lstatType(path.join(dir, n), { fsImpl }).type === wantType) out.push(Number(m[1]));
  }
  return out;
}

// { runDir, worktree?, gitRoot?, fsImpl? } -> ['#N', ...] (ascending) | null.
// A multi-spec run's records are its spec-{N}/ subdirectories. A single-record
// run's are its work/{n}-spec.md names, and that spec is committed inside the
// worktree at the run dir's path relative to the main checkout — so the
// worktree copy (run-state.json's `worktree`) is read first, the run dir's
// own work/ second.
function resolveTargetRecords({ runDir, worktree = null, gitRoot = null, fsImpl = fs } = {}) {
  const roots = [];
  if (typeof worktree === 'string' && worktree && gitRoot && isPathContained(runDir, gitRoot)) {
    roots.push(path.join(worktree, path.relative(gitRoot, runDir)));
  }
  roots.push(runDir);
  const format = (nums) => [...new Set(nums)].sort((a, b) => a - b).map((n) => `#${n}`);
  const specDirs = roots.flatMap((r) => numberedEntries(r, /^spec-([1-9]\d*)$/, 'directory', fsImpl));
  if (specDirs.length) return format(specDirs);
  for (const r of roots) {
    const specs = numberedEntries(path.join(r, 'work'), /^([1-9]\d*)-spec\.md$/, 'file', fsImpl);
    if (specs.length) return format(specs);
  }
  return null;
}

// -> the handoff.json object a fresh agent resumes from.
function buildHandoff({ runDir, nextSteps, contextTokens, cap, targets, now }) {
  return {
    nextSteps: [...nextSteps],
    contextTokens,
    cap,
    writtenAt: new Date(now).toISOString(),
    resume: `PIPELINE_RUN_DIR="${runDir}" /claude-tweaks:flow "${targets.join(',')}" ${nextSteps.join(',')} auto`,
  };
}

module.exports = {
  CONTEXT_CAP_TOKENS, FIRST_USER_SCAN_BYTES, firstUserText, findAgentTranscript, gauge, resolveTargetRecords, buildHandoff,
};
