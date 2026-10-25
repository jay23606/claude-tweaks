#!/usr/bin/env node
// bin/close-out-marker.js — read, write and resolve the `close-out-update` PR
// run comment's update marker (#4331).
//   node bin/close-out-marker.js read --comments-file <file> [--help]
//   node bin/close-out-marker.js write --comments-file <file> --update-method <m>
//        --conflicted-files <list|none|unknown> --pre-update-head <40-hex>
//        --resolution-commit <40-hex|pending> --out <file>
//   node bin/close-out-marker.js resolve-pending --comments-file <file> --sha <40-hex> --out <file>
// The parsing, validation and accumulation rules live in
// bin/lib/dispatch/close-out-marker.js; this CLI is the file/argv seam over them
// for skills/dispatch/close-out-update.md. The comment is found through
// find-run-comment.js's findRunComments (kind `close-out-update`), so a marker
// from an untrusted author is skipped and named, never read.
//
// Input: a gh `{comments: [...]}` payload, or a bare REST/MCP comment array.
// Stdout (exit 0), one JSON line:
//   read:  {status, id, updateMethod, conflictedFiles, preUpdateHead,
//           resolutionCommits, skipped}. status is `none` (no trusted marker; the
//           four fields are null), `pending`, `cleared` or `unreadable` (the
//           fields then read 'unknown'). An unreadable marker is still exit 0:
//           the status is data.
//   write / resolve-pending: {written, accumulated, marker}. `written` is true,
//           `marker` is the written body parsed back (parseMarker's shape), and
//           `accumulated` is true only when `write` folded the update into an
//           existing pending marker (a fresh marker, or resolve-pending's in-place
//           replacement, is false).
// `write` over a `pending` marker appends the update (oldest first, files
// unioned, pre-update-head replaced); over no marker or a `cleared` one it writes
// a fresh marker from the flags; over an `unreadable` one it refuses.
//
// Every flag value is validated here, before the file is read: the module's
// appendUpdate/resolvePendingCommit do not validate. `--conflicted-files` is
// `none` ([]), `unknown`, or a comma list whose entries are trimmed; an empty
// entry is a usage error. Path entries are otherwise passed through as-is: they
// are untrusted text (a conflicted path is attacker-nameable), so a caller quotes
// them and never pastes one into a command unquoted.
//
// Exit vocabulary is the Payload-1/Invocation-2 family of find-run-comment.js and
// wrap-up-engine.js: 0 = answered; 1 = Payload failure, the --comments-file
// unreadable, unparseable or not a comments list, or (write / resolve-pending) a
// marker that cannot be used (unreadable; no pending entry to resolve);
// 2 = Invocation failure, a malformed argv; 3 = the --out could not be written
// (qa-report.js's precedent: --out is a caller-named artifact, written
// atomically with no lock and no run-dir anchoring).
'use strict';

const fs = require('fs');
const { findRunComments } = require('./find-run-comment');
const { isTrustedComment } = require('./lib/issues/comment-trust');
const { writeFileAtomic } = require('./lib/atomic-write');
const {
  UPDATE_METHODS,
  parseMarker,
  serializeMarker,
  appendUpdate,
  resolvePendingCommit,
} = require('./lib/dispatch/close-out-marker');

const KIND = 'close-out-update';
const SHA_RE = /^[0-9a-f]{40}$/i;

const USAGE = 'usage: close-out-marker.js read --comments-file <file> [--help]\n'
  + '       close-out-marker.js write --comments-file <file> --update-method <merge|gh pr update-branch>\n'
  + '           --conflicted-files <a,b|none|unknown> --pre-update-head <40-hex> --resolution-commit <40-hex|pending> --out <file>\n'
  + '       close-out-marker.js resolve-pending --comments-file <file> --sha <40-hex> --out <file>\n'
  + '  exit 0 answered, 1 comments payload or marker unusable, 2 malformed invocation, 3 --out unwritable\n';

// Per verb: the flags it takes (all required) and the key each is stored under.
const VERBS = {
  read: { '--comments-file': 'commentsFile' },
  write: {
    '--comments-file': 'commentsFile',
    '--update-method': 'updateMethod',
    '--conflicted-files': 'conflictedFiles',
    '--pre-update-head': 'preUpdateHead',
    '--resolution-commit': 'resolutionCommit',
    '--out': 'out',
  },
  'resolve-pending': {
    '--comments-file': 'commentsFile',
    '--sha': 'sha',
    '--out': 'out',
  },
};

function parseArgs(argv) {
  const o = { help: false, verb: null };
  let start = 0;
  if (argv.length > 0 && !argv[0].startsWith('-')) {
    o.verb = argv[0];
    start = 1;
    if (!Object.hasOwn(VERBS, o.verb)) return { error: `unknown verb: ${o.verb}` };
  }
  const flags = o.verb === null ? {} : VERBS[o.verb];
  for (let i = start; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { o.help = true; continue; }
    if (!Object.hasOwn(flags, a)) return { error: `unknown argument: ${a}` };
    const v = argv[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) return { error: `${a} needs a value` };
    if (Object.hasOwn(o, flags[a])) return { error: `${a} given more than once` };
    o[flags[a]] = v;
    i++;
  }
  if (!o.help && o.verb === null) return { error: 'a verb is required' };
  return o;
}

// The flags a verb requires, each present; then the value-shape checks. Returns
// an error string, or null when the invocation is well-formed. Normalises the
// parsed values in place (hex lowercased, the conflicted-files list split).
function validate(o) {
  for (const [flag, key] of Object.entries(VERBS[o.verb])) {
    if (!Object.hasOwn(o, key)) return `${flag} is required`;
  }
  if (o.verb === 'read') return null;
  if (o.verb === 'resolve-pending') {
    if (!SHA_RE.test(o.sha)) return `--sha must be 40 hex characters, got: ${o.sha}`;
    o.sha = o.sha.toLowerCase();
    return null;
  }
  if (!UPDATE_METHODS.includes(o.updateMethod)) {
    return `--update-method must be one of: ${UPDATE_METHODS.join(', ')}; got: ${o.updateMethod}`;
  }
  if (!SHA_RE.test(o.preUpdateHead)) return `--pre-update-head must be 40 hex characters, got: ${o.preUpdateHead}`;
  o.preUpdateHead = o.preUpdateHead.toLowerCase();
  if (o.resolutionCommit !== 'pending') {
    if (!SHA_RE.test(o.resolutionCommit)) return `--resolution-commit must be 40 hex characters or pending, got: ${o.resolutionCommit}`;
    o.resolutionCommit = o.resolutionCommit.toLowerCase();
  }
  if (o.conflictedFiles === 'none') o.conflictedFiles = [];
  else if (o.conflictedFiles !== 'unknown') {
    const entries = o.conflictedFiles.split(',').map((s) => s.trim());
    if (entries.some((e) => e === '')) return `--conflicted-files has an empty entry: ${o.conflictedFiles}`;
    o.conflictedFiles = entries;
  }
  return null;
}

const realDeps = {
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  writeFile: (p, content) => writeFileAtomic(p, content),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

const errMsg = (e) => (e && (e.code || e.message)) || 'unknown';

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`close-out-marker.js: ${message}\n${USAGE}`); return 2; };
  const fail = (code, message) => { deps.stderr(`close-out-marker.js: ${message}\n`); return code; };
  if (o.error) return usageError(o.error);
  if (o.help) { deps.stdout(USAGE); return 0; }
  const invalid = validate(o);
  if (invalid) return usageError(invalid);

  let payload;
  try { payload = JSON.parse(deps.readFile(o.commentsFile)); } catch (e) {
    return fail(1, `could not read or parse --comments-file: ${o.commentsFile} (${errMsg(e)})`);
  }
  const found = findRunComments(payload, KIND);
  if (found === null) return fail(1, `--comments-file ${o.commentsFile} is not a comments list`);

  // The trusted comment findRunComments chose: the first trusted marker comment
  // carrying that id.
  let existing = null;
  if (found.id !== null) {
    const comments = Array.isArray(payload) ? payload : payload.comments;
    const marker = `<!-- run-comment: ${KIND} -->`;
    const hit = comments.find((c) => c !== null && typeof c === 'object' && typeof c.body === 'string'
      && c.body.startsWith(marker) && isTrustedComment(c) && String(c.id) === found.id);
    existing = parseMarker(hit.body);
  }

  if (o.verb === 'read') {
    deps.stdout(`${JSON.stringify({
      status: existing === null ? 'none' : existing.status,
      id: found.id,
      updateMethod: existing === null ? null : existing.updateMethod,
      conflictedFiles: existing === null ? null : existing.conflictedFiles,
      preUpdateHead: existing === null ? null : existing.preUpdateHead,
      resolutionCommits: existing === null ? null : existing.resolutionCommits,
      skipped: found.skipped,
    })}\n`);
    return 0;
  }

  let next;
  let accumulated = false;
  if (o.verb === 'write') {
    if (existing !== null && existing.status === 'unreadable') {
      return fail(1, `marker unreadable: comment ${found.id} is a close-out-update comment this CLI cannot parse; nothing written`);
    }
    if (existing !== null && existing.status === 'pending') {
      next = appendUpdate(existing, o);
      accumulated = true;
    } else {
      next = {
        updateMethod: [o.updateMethod],
        conflictedFiles: o.conflictedFiles,
        preUpdateHead: o.preUpdateHead,
        resolutionCommits: [o.resolutionCommit],
      };
    }
  } else {
    if (existing === null || existing.status !== 'pending') {
      return fail(1, `no pending marker to resolve (marker is ${existing === null ? 'none' : existing.status}); nothing written`);
    }
    next = resolvePendingCommit(existing, o.sha);
    if (next === null) return fail(1, 'the pending marker has no pending resolution-commit entry to resolve; nothing written');
  }

  const body = serializeMarker(next);
  try { deps.writeFile(o.out, body); } catch (e) {
    return fail(3, `out-unwritable: ${o.out} (${errMsg(e)})`);
  }
  deps.stdout(`${JSON.stringify({ written: true, accumulated, marker: parseMarker(body) })}\n`);
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
