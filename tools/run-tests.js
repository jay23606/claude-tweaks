#!/usr/bin/env node
'use strict';

// Portable replacement for the shell-only test invocations this repo used to run via
// `package.json`'s "test" and "test:perf" scripts, e.g. `CT_HOOKS_GIT_TIMEOUT_MS=60000
// node --test $(find tests tools/upstream-drift/tests -name '*.test.js' | sort)`. That form
// relies on a POSIX env-prefix and `$(...)` command substitution, neither of which `npm` on
// Windows can run under `cmd.exe`. This script reproduces the same file selection and env
// default in pure Node, then runs `node --test` the same way, so both scripts work identically
// on POSIX and Windows.
//
// Roots default to the "test" script's set (`tests`, `tools/upstream-drift/tests`); pass one or
// more repo-relative root paths as CLI positional args to override — `test:perf` invokes this as
// `node tools/run-tests.js perf`.
//
// Elsewhere the explicit file list goes to `node --test`; on Windows (Node >= 22) the root globs
// go instead, because ~780 paths overflow the 32,767-char command line (#3316).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// The repo root every root path is relative to — both the explicit file list and the win32
// root globs resolve against it (the spawned `node --test` runs with it as cwd), so the two
// branches select the same files whatever directory the caller ran this from.
const REPO_ROOT = path.join(__dirname, '..');
const DEFAULT_ROOTS = ['tests', path.join('tools', 'upstream-drift', 'tests')];

// Reads `dir` directly and treats a missing directory as "no files here" — never
// `fs.existsSync(dir)` first: that shape is a check-then-act race (the directory can vanish
// between the check and the read) and, more to the point here, both `dir` values are static
// repo-relative roots, so the only realistic way this ever throws ENOENT is a genuine absence,
// which is exactly the case this function already needs to treat as empty.
function collectTestFiles(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTestFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      results.push(full);
    }
  }
}

// Walks `roots` (relative to `cwd`, defaulting to this repo's root) and returns every
// `*.test.js` file, sorted — the same file set `find {roots} -name '*.test.js' | sort` would
// produce. `roots` defaults to DEFAULT_ROOTS (the "test" script's set) when omitted or empty.
// Exported so tests can exercise the selection logic directly instead of shelling out.
function listTestFiles(cwd, roots) {
  const base = cwd || REPO_ROOT;
  const useRoots = roots && roots.length ? roots : DEFAULT_ROOTS;
  const files = [];
  for (const root of useRoots) {
    collectTestFiles(path.resolve(base, root), files);
  }
  files.sort();
  return files;
}

// Matches a positive integer with no sign, fraction, or leading zero — the shape both
// `CT_TEST_CONCURRENCY` and `CT_TEST_SUITE_SLOTS` accept.
const POSITIVE_INT = /^[1-9]\d*$/;

// How many test files `node --test` runs at once. Half the cores (at least 1) by default so one
// suite leaves the machine usable for sibling worktrees (#3969); `CT_TEST_CONCURRENCY` overrides
// with a positive integer, and an invalid value is ignored rather than failing the run.
// Pure: `env` and `cpus` are parameters, never read from `process`/`os`.
function resolveConcurrency(env, cpus) {
  const raw = env.CT_TEST_CONCURRENCY;
  if (typeof raw === 'string' && POSITIVE_INT.test(raw)) return Number(raw);
  return Math.max(1, Math.floor(cpus / 2));
}

// How many full suites may run at once across processes (the slot semaphore). Defaults to 1;
// `CT_TEST_SUITE_SLOTS` overrides with a positive integer. An invalid value falls back to 1 and
// says so once through `log`, so a typo is visible instead of silently changing the cap.
function resolveSlots(env, log) {
  const raw = env.CT_TEST_SUITE_SLOTS;
  if (raw === undefined) return 1;
  if (typeof raw === 'string' && POSITIVE_INT.test(raw)) return Number(raw);
  log(`run-tests.js: ignoring invalid CT_TEST_SUITE_SLOTS=${JSON.stringify(raw)} (want a positive integer) — using 1 slot.`);
  return 1;
}

// Returns the argv (after the node binary) for `node --test`. The explicit file list is the
// default — `node --test` glob args don't work on Node 20 (#407). On win32 that list overflows
// the 32,767-char command line (#3316), so there it passes the root globs, which needs Node >= 22.
// `--test-concurrency=<n>` follows `--test` on both branches (#3969); `concurrency` must be a
// positive integer, checked before the win32/Node<22 error so that error keeps its own message.
// Pure: `platform`, `nodeMajor` and `concurrency` are parameters, never read from `process`.
function buildTestArgs(files, roots, { platform, nodeMajor, concurrency }) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`buildTestArgs: concurrency must be a positive integer (got ${String(concurrency)}).`);
  }
  const head = ['--test', `--test-concurrency=${concurrency}`];
  if (platform !== 'win32') return [...head, ...files];
  if (nodeMajor < 22) {
    throw new Error(
      'the Windows command line cannot hold the explicit test-file list, and `node --test` ' +
        `globs need Node >= 22 on Windows (running Node ${nodeMajor}).`,
    );
  }
  return [...head, ...roots.map((root) => `${root.split(/[\\/]/).join('/')}/**/*.test.js`)];
}

module.exports = { listTestFiles, buildTestArgs, resolveConcurrency, resolveSlots };

if (require.main === module) {
  const argRoots = process.argv.slice(2);
  const roots = argRoots.length ? argRoots : DEFAULT_ROOTS;
  const files = listTestFiles(REPO_ROOT, roots).map((f) => path.relative(REPO_ROOT, f));

  // `node --test` with zero file arguments falls back to its own default-pattern
  // auto-discovery and can exit 0 having run nothing — "the suite gets quieter, not
  // redder" (docs/incident-log.md:421). A rename/typo of a root must fail loudly here,
  // not degrade into a silently-green `npm test`/`npm run test:perf`.
  if (files.length === 0) {
    console.error(
      `run-tests.js: found zero *.test.js files under ${roots.join(', ')} — refusing to run ` +
        "`node --test` with no explicit files (it would silently discover its own defaults " +
        'and exit 0 having run nothing). Check that these directories exist and are non-empty.',
    );
    process.exit(1);
  }

  process.env.CT_HOOKS_GIT_TIMEOUT_MS = process.env.CT_HOOKS_GIT_TIMEOUT_MS || '60000';

  let testArgs;
  try {
    testArgs = buildTestArgs(files, roots, {
      platform: process.platform,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      concurrency: resolveConcurrency(process.env, os.availableParallelism()),
    });
  } catch (err) {
    console.error(`run-tests.js: ${err.message}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, testArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status === null ? 1 : result.status);
}
