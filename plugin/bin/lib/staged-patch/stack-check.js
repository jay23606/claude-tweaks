// bin/lib/staged-patch/stack-check.js — #3290's staging-time stacked check: does a staged
// `.patch` still apply once every staged patch that sorts before it has applied, and when it
// does not, which earlier patch broke it. Pure checking: every apply runs in a throwaway scratch
// repo built from the worktree's files, so the worktree and any staged/ dir are never written.
//
// `stagedApplyOrder` is the apply order — the same byte-wise default sort `readSnapshot`
// (bin/lib/console/resolve.js) applies to staged/ entries, so this check walks patches in the
// order the console applies them. Results carry basenames only. A copied path that is absolute
// or has a `..` segment is never read: its patch lands in `skipped`.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function stagedApplyOrder(names) {
  return names.filter((n) => n.endsWith('.patch')).sort();
}

function defaultGit(args, { cwd }) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// `git apply --numstat -z` emits one NUL-terminated `added\tdeleted\tpath` record per file,
// path being the destination for a rename.
function copiedPaths(stdout) {
  return stdout.split('\0')
    .map((rec) => rec.slice(rec.indexOf('\t', rec.indexOf('\t') + 1) + 1))
    .filter((p) => p !== '');
}

// numstat reports only the destination of a rename that also changes content, so the source
// comes from the header. A C-quoted name (rare) is taken verbatim: it then fails to copy and the
// patch is skipped, which is the safe outcome.
function headerSources(text) {
  return [...text.matchAll(/^(?:rename|copy) from (.+)$/gm)].map((m) => m[1]);
}

function isUnsafe(rel) {
  return path.isAbsolute(rel) || rel.split('/').includes('..');
}

function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// First line of a git message, with the patch's absolute path replaced by its basename.
function firstLine(stderr, abs) {
  const line = String(stderr || '').split('\n')[0].trim();
  return line.split(abs).join(path.basename(abs));
}

// { worktree, patches, target, git? } -> { ok, order, skipped, conflicts, targetConflict,
// targetUnapplicable }. `patches` are absolute paths in apply order; `target` is one of them.
function checkStack({ worktree, patches, target, git = defaultGit }) {
  const run = (args, cwd) => {
    const r = git(args, { cwd });
    if (r.status === null) throw new Error(`git ${args.join(' ')} did not complete (cwd ${cwd})`);
    return r;
  };

  const withScratch = (present, fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-stack-'));
    try {
      run(['init', '-q'], dir);
      for (const rel of present) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.copyFileSync(path.join(worktree, rel), path.join(dir, rel));
      }
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  // p failed in the apply walk. Re-check it alone on a fresh scratch: failing there means p is
  // broken by itself (skipped). Otherwise replay the applied patches one at a time and name the
  // first one after which p fails. A failing patch is never applied.
  const attribute = (p, applied, present) => withScratch(present, (dir) => {
    const alone = run(['apply', '--check', p], dir);
    if (alone.status !== 0) return { skipped: firstLine(alone.stderr, p) };
    for (const prior of applied) {
      const ap = run(['apply', prior], dir);
      if (ap.status !== 0) throw new Error(`replay of ${path.basename(prior)} failed: ${firstLine(ap.stderr, prior)}`);
      const re = run(['apply', '--check', p], dir);
      if (re.status !== 0) return { conflictsWith: path.basename(prior), error: firstLine(re.stderr, p) };
    }
    throw new Error(`stack attribution for ${path.basename(p)} did not reproduce its walk-time failure`);
  });

  const skipped = [];
  const live = [];
  const copied = new Set();
  for (const p of patches) {
    const name = path.basename(p);
    const numstat = run(['apply', '--numstat', '-z', p], worktree);
    if (numstat.status !== 0) {
      skipped.push({ patch: name, error: firstLine(numstat.stderr, p) });
      continue;
    }
    const paths = [...copiedPaths(numstat.stdout), ...headerSources(fs.readFileSync(p, 'utf8'))];
    const unsafe = paths.find(isUnsafe);
    if (unsafe !== undefined) {
      skipped.push({ patch: name, error: `unsafe path ${unsafe}` });
      continue;
    }
    paths.forEach((rel) => copied.add(rel));
    live.push(p);
  }
  const present = [...copied].filter((rel) => isFile(path.join(worktree, rel)));

  const conflicts = [];
  withScratch(present, (dir) => {
    const applied = [];
    for (const p of live) {
      if (run(['apply', '--check', p], dir).status === 0 && run(['apply', p], dir).status === 0) {
        applied.push(p);
        continue;
      }
      const found = attribute(p, applied, present);
      if (found.skipped !== undefined) {
        skipped.push({ patch: path.basename(p), error: found.skipped });
      } else {
        conflicts.push({ patch: path.basename(p), conflictsWith: found.conflictsWith, error: found.error });
      }
    }
  });

  const targetName = path.basename(target);
  const targetConflict = conflicts.find((c) => c.patch === targetName || c.conflictsWith === targetName) || null;
  const targetUnapplicable = skipped.some((s) => s.patch === targetName);
  return {
    ok: targetConflict === null && !targetUnapplicable,
    order: patches.map((p) => path.basename(p)),
    skipped,
    conflicts,
    targetConflict,
    targetUnapplicable,
  };
}

module.exports = { stagedApplyOrder, checkStack };
