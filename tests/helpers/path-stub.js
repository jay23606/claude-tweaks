'use strict';
// Shared PATH stand-in helpers for tests that fake or narrow `git`/`gh` (#4285).
//
// Many tests write a `#!/bin/sh` script named `git` or `gh` into a temp dir,
// prepend that dir to PATH, and let the code under test spawn it. On a
// Windows checkout that stub never resolves: libuv's PATH search tries only
// the bare `name`, `name.com` and `name.exe` — never PATHEXT's `.bat`/`.cmd`
// — and a `.cmd` shim spawned without a shell is refused with EINVAL
// (Node's CVE-2024-27980 hardening). The real `git.exe` further down PATH
// answers instead, so the test asserts against the wrong process.
//
// Converting such a test would mean either a shell-mode spawn in production
// code (a behavior change made only for tests) or a compiled .exe stub, so a
// stub test skips on win32 instead: STUB_SKIP is node:test's `skip` value —
// false off win32 (never skipped), STUB_SKIP_REASON on win32 — an explicit
// skip that the TAP output names, never a silent early `return`.
// installStub(name, script) is the one way such a test installs its stub,
// and its restore() puts PATH back and removes the stub dir.
//
// pathWithOnly(names, { exclude }) serves the other shape: a test that needs
// a PATH holding a real binary (e.g. `git`) but not another (e.g. `gh`). The
// old way symlinked the binary into a temp dir, which needs a privilege on
// Windows; pathWithOnly uses the binary's own directory when that directory
// holds no excluded name — so the test keeps running on Windows — and falls
// back to a symlink dir only when it does (on Windows, Git for Windows and
// the GitHub CLI install into separate directories, so no symlink is made).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STUB_SKIP_REASON = 'win32: execFile resolves only .exe/.com on PATH, so a script stub is never spawned';
const STUB_SKIP = process.platform === 'win32' && STUB_SKIP_REASON;

function installStub(name, script) {
  const original = process.env.PATH;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-stub-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, script);
  fs.chmodSync(file, 0o755); // root-safe: exec-bit stub, not a denial simulation
  process.env.PATH = dir + path.delimiter + original;
  let restored = false;
  return function restore() {
    if (restored) return;
    restored = true;
    process.env.PATH = original;
    fs.rmSync(dir, { recursive: true, force: true });
  };
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function pathWithOnly(names, { exclude = [], env = process.env, platform = process.platform } = {}) {
  const isWin = platform === 'win32';
  const exts = isWin ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [];
  const candidates = (name) => (isWin ? [...exts.map((ext) => name + ext), name] : [name]);
  const dirs = (env.PATH ?? env.Path ?? '').split(isWin ? ';' : ':').filter(Boolean);
  const excluded = (dir) => exclude.some((ex) => candidates(ex).some((c) => isFile(path.join(dir, c))));

  const result = [];
  let linkDir = null;
  for (const name of names) {
    let found = null;
    for (const dir of dirs) {
      const hit = candidates(name).find((c) => isFile(path.join(dir, c)));
      if (hit) {
        found = path.join(dir, hit);
        break;
      }
    }
    if (!found) throw new Error(`pathWithOnly: ${name} not found on PATH`);
    let dir = path.dirname(found);
    if (excluded(dir)) {
      if (!linkDir) linkDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-path-only-'));
      fs.symlinkSync(found, path.join(linkDir, path.basename(found)));
      dir = linkDir;
    }
    if (!result.includes(dir)) result.push(dir);
  }
  return result.join(path.delimiter);
}

module.exports = {
  STUB_SKIP_REASON,
  STUB_SKIP,
  installStub,
  pathWithOnly,
};
