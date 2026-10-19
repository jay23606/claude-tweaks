// bin/lib/staged-patch/stack-check.js — #3290's staging-time stacked check: does a staged
// `.patch` still apply once every staged patch that sorts before it has applied, and when it
// does not, which earlier patch broke it. Pure checking: every apply runs in a throwaway scratch
// repo built from the worktree's files, so the worktree and any staged/ dir are never written.
//
// `stagedApplyOrder` is the apply order — the same byte-wise default sort `readSnapshot`
// (bin/lib/console/resolve.js) applies to staged/ entries, so this check walks patches in the
// order the console applies them. Results carry basenames only. A copied path that is absolute
// or has a `..` segment is never read: its patch lands in `skipped`.
//
// `rederive` re-derives a conflicting patch onto the stacked state with a per-file 3-way merge.
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

// The git runner and scratch builders for one worktree. Every scratch is a fresh repo seeded
// with `present` copies of the worktree's files; `withTemp` removes its directory however `fn`
// exits.
function toolkit(worktree, git) {
  const run = (args, cwd) => {
    const r = git(args, { cwd });
    if (r.status === null) throw new Error(`git ${args.join(' ')} did not complete (cwd ${cwd})`);
    return r;
  };

  const withTemp = (fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-stack-'));
    try {
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  const withScratch = (present, fn) => withTemp((dir) => {
    run(['init', '-q'], dir);
    for (const rel of present) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.copyFileSync(path.join(worktree, rel), path.join(dir, rel));
    }
    return fn(dir);
  });

  return { run, withTemp, withScratch };
}

// Walks `patches` in apply order onto one scratch. Returns `skipped` and `conflicts`, `applied`
// (the patches that applied, in apply order), and `present` (the worktree files the walk copied).
function walkStack({ worktree, patches, git }) {
  const { run, withScratch } = toolkit(worktree, git);

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
  const applied = [];
  withScratch(present, (dir) => {
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

  return { skipped, conflicts, applied, present };
}

// { worktree, patches, target, git? } -> { ok, order, skipped, conflicts, targetConflict,
// targetUnapplicable }. `patches` are absolute paths in apply order; `target` is one of them.
function checkStack({ worktree, patches, target, git = defaultGit }) {
  const { skipped, conflicts } = walkStack({ worktree, patches, git });

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

// { worktree, patches, target, git? } -> { ok: true, patch } | { ok: false, reason }. `target`
// is re-derived per file: ours is the stacked state (the patches before it that the walk
// applied), base is the worktree file, theirs is the worktree with only `target` applied.
// `patch` is target's preamble verbatim followed by the diff of the merged files against the
// stacked state. Creates, deletes, renames, and unsafe paths are refused.
function rederive({ worktree, patches, target, git = defaultGit }) {
  const { run, withTemp, withScratch } = toolkit(worktree, git);

  const summary = run(['apply', '--summary', target], worktree);
  if (summary.status !== 0) return { ok: false, reason: firstLine(summary.stderr, target) };
  if (/^ (create mode|delete mode|rename )/m.test(summary.stdout)) {
    return { ok: false, reason: 'non-modification hunk' };
  }

  const numstat = run(['apply', '--numstat', '-z', target], worktree);
  if (numstat.status !== 0) return { ok: false, reason: firstLine(numstat.stderr, target) };
  const rels = copiedPaths(numstat.stdout);
  const unsafe = rels.find(isUnsafe);
  if (unsafe !== undefined) return { ok: false, reason: `unsafe path ${unsafe}` };
  const text = fs.readFileSync(target, 'utf8');
  const head = text.search(/^diff --git /m);
  if (head < 0 || rels.length === 0) return { ok: false, reason: 'target has no diff' };
  const missing = rels.find((rel) => !isFile(path.join(worktree, rel)));
  if (missing !== undefined) return { ok: false, reason: `${missing} is not a file in the worktree` };

  const idx = patches.indexOf(target);
  if (idx < 0) throw new Error(`rederive target ${path.basename(target)} is not in patches`);
  const prior = walkStack({ worktree, patches: patches.slice(0, idx), git });
  const present = [...new Set([...prior.present, ...rels])];

  const theirs = withScratch(present, (dir) => {
    const ap = run(['apply', target], dir);
    if (ap.status !== 0) return { error: firstLine(ap.stderr, target) };
    return { files: Object.fromEntries(rels.map((rel) => [rel, fs.readFileSync(path.join(dir, rel), 'utf8')])) };
  });
  if (theirs.error !== undefined) return { ok: false, reason: theirs.error };

  return withScratch(present, (dir) => {
    for (const p of prior.applied) {
      if (run(['apply', p], dir).status !== 0) throw new Error(`replay of ${path.basename(p)} failed`);
    }
    run(['add', '-A'], dir);
    return withTemp((work) => {
      for (const rel of rels) {
        const ours = path.join(work, 'ours');
        const base = path.join(work, 'base');
        const their = path.join(work, 'theirs');
        fs.copyFileSync(path.join(dir, rel), ours);
        fs.copyFileSync(path.join(worktree, rel), base);
        fs.writeFileSync(their, theirs.files[rel]);
        const merged = run(['merge-file', '-p', ours, base, their], work);
        if (merged.status > 0) return { ok: false, reason: `conflict in ${rel}` };
        fs.writeFileSync(path.join(dir, rel), merged.stdout);
      }
      const diff = run(['diff', '--no-color', '--no-ext-diff'], dir);
      if (diff.stdout === '') return { ok: false, reason: 'already satisfied by an earlier patch' };
      return { ok: true, patch: text.slice(0, head) + diff.stdout };
    });
  });
}

module.exports = { stagedApplyOrder, checkStack, rederive };
