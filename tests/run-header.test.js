'use strict';

// run-header — the one resolver for where a spec header (work/{N}-spec.md)
// lives, live or archived (#3974).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  PIPELINES_REL,
  ARCHIVE_SEGMENT,
  HEADER_PATH_RE,
  runIdentity,
  checkoutRootOf,
  headerRelPaths,
  headerPathspecs,
  headerTreeDirs,
  findHeaderFiles,
  listHeaderDirs,
} = require('../plugin/bin/lib/run-header');

const P = '.claude-tweaks/pipelines';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'run-header-'));
}

// Writes `rel` (POSIX, repo-relative) under `root`, creating parents.
function put(root, rel, body = '# header\n') {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  return abs;
}

test('constants', () => {
  assert.strictEqual(PIPELINES_REL, '.claude-tweaks/pipelines');
  assert.strictEqual(ARCHIVE_SEGMENT, 'archive');
});

test('HEADER_PATH_RE matches both header locations and nothing else', () => {
  assert.ok(HEADER_PATH_RE.test('work/5-spec.md'));
  assert.ok(HEADER_PATH_RE.test(`${P}/R/work/5-spec.md`));
  assert.ok(HEADER_PATH_RE.test(`${P}/R/spec-5/work/5-spec.md`));
  assert.ok(HEADER_PATH_RE.test(`${P}/archive/R/spec-12/work/12-spec.md`));
  assert.ok(!HEADER_PATH_RE.test(`${P}/R/work/5-plan.md`));
  assert.ok(!HEADER_PATH_RE.test(`${P}/R/notwork/5-spec.md`));
  assert.ok(!HEADER_PATH_RE.test(`${P}/R/5-spec.md`));
  assert.ok(!HEADER_PATH_RE.test(`${P}/R/work/5-spec.md.bak`));
});

test('runIdentity: per-spec dir under a run-id parent yields the parent run id and N', () => {
  assert.deepStrictEqual(
    runIdentity('/p/.claude-tweaks/pipelines/2026-10-22T184947-spec-1-2/spec-7'),
    { runId: '2026-10-22T184947-spec-1-2', specN: 7 },
  );
});

test('runIdentity: a plain run dir yields its basename and a null specN', () => {
  assert.deepStrictEqual(
    runIdentity('/p/.claude-tweaks/pipelines/2026-08-22T061958-record-991'),
    { runId: '2026-08-22T061958-record-991', specN: null },
  );
});

test('runIdentity: spec-N under a non-run-id parent is itself the run id', () => {
  assert.deepStrictEqual(runIdentity('/x/spec-7'), { runId: 'spec-7', specN: null });
});

test('runIdentity: unusable input is null', () => {
  assert.strictEqual(runIdentity(''), null);
  assert.strictEqual(runIdentity('.'), null);
  assert.strictEqual(runIdentity('..'), null);
  assert.strictEqual(runIdentity(undefined), null);
  assert.strictEqual(runIdentity(42), null);
});

test('headerRelPaths: live-flat, live-nested, archived-flat, archived-nested', () => {
  assert.deepStrictEqual(headerRelPaths('R', 5), [
    `${P}/R/work/5-spec.md`,
    `${P}/R/spec-5/work/5-spec.md`,
    `${P}/archive/R/work/5-spec.md`,
    `${P}/archive/R/spec-5/work/5-spec.md`,
  ]);
});

test("headerRelPaths: shape 'nested' drops the flat entries", () => {
  assert.deepStrictEqual(headerRelPaths('R', 5, { shape: 'nested' }), [
    `${P}/R/spec-5/work/5-spec.md`,
    `${P}/archive/R/spec-5/work/5-spec.md`,
  ]);
});

test('headerRelPaths: specN set names only that spec dir, live then archived', () => {
  assert.deepStrictEqual(headerRelPaths('R', 5, { specN: 5 }), [
    `${P}/R/spec-5/work/5-spec.md`,
    `${P}/archive/R/spec-5/work/5-spec.md`,
  ]);
});

test('headerPathspecs: parent or single run carries the trailing wildcard on the nested form', () => {
  assert.deepStrictEqual(headerPathspecs('R'), [
    `${P}/R/work`,
    `${P}/R/spec-*/work/*`,
    `${P}/archive/R/work`,
    `${P}/archive/R/spec-*/work/*`,
  ]);
});

test('headerPathspecs: per-spec form names only that spec', () => {
  assert.deepStrictEqual(headerPathspecs('R', { specN: 4 }), [
    `${P}/R/spec-4/work/*`,
    `${P}/archive/R/spec-4/work/*`,
  ]);
});

test('headerTreeDirs: run dirs, suffixed with spec-N for a per-spec run', () => {
  assert.deepStrictEqual(headerTreeDirs('R'), [`${P}/R`, `${P}/archive/R`]);
  assert.deepStrictEqual(headerTreeDirs('R', { specN: 4 }), [`${P}/R/spec-4`, `${P}/archive/R/spec-4`]);
});

test('findHeaderFiles: live and archived in one root come back live first', () => {
  const root = tmp();
  try {
    const archived = put(root, `${P}/archive/R/work/5-spec.md`);
    const live = put(root, `${P}/R/work/5-spec.md`);
    assert.deepStrictEqual(findHeaderFiles([root], 'R', 5), [live, archived]);
    assert.deepStrictEqual(live, path.join(root, '.claude-tweaks', 'pipelines', 'R', 'work', '5-spec.md'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findHeaderFiles: roots are walked in caller order, archived-in-root-1 before live-in-root-2', () => {
  const r1 = tmp();
  const r2 = tmp();
  try {
    const a1 = put(r1, `${P}/archive/R/spec-5/work/5-spec.md`);
    const l2 = put(r2, `${P}/R/work/5-spec.md`);
    assert.deepStrictEqual(findHeaderFiles([r1, r2], 'R', 5), [a1, l2]);
    assert.deepStrictEqual(findHeaderFiles([r2, r1], 'R', 5), [l2, a1]);
  } finally {
    fs.rmSync(r1, { recursive: true, force: true });
    fs.rmSync(r2, { recursive: true, force: true });
  }
});

test('findHeaderFiles: flat before nested within one location', () => {
  const root = tmp();
  try {
    const nested = put(root, `${P}/R/spec-5/work/5-spec.md`);
    const flat = put(root, `${P}/R/work/5-spec.md`);
    assert.deepStrictEqual(findHeaderFiles([root], 'R', 5), [flat, nested]);
    assert.deepStrictEqual(findHeaderFiles([root], 'R', 5, { shape: 'nested' }), [nested]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('findHeaderFiles: a missing root, a directory at the header path, and junk roots yield nothing and never throw', () => {
  const root = tmp();
  try {
    fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'R', 'work', '5-spec.md'), { recursive: true });
    const missing = path.join(root, 'does-not-exist');
    assert.deepStrictEqual(findHeaderFiles([missing], 'R', 5), []);
    assert.deepStrictEqual(findHeaderFiles([root], 'R', 5), []);
    assert.deepStrictEqual(findHeaderFiles([null, undefined, 3], 'R', 5), []);
    assert.deepStrictEqual(findHeaderFiles(undefined, 'R', 5), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('listHeaderDirs: live flat, live spec-N ascending, then archived flat, with location tags', () => {
  const root = tmp();
  try {
    put(root, `${P}/R/spec-9/work/9-spec.md`);
    put(root, `${P}/R/spec-2/work/2-spec.md`);
    put(root, `${P}/archive/R/work/1-spec.md`);
    put(root, `${P}/R/spec-10/notwork/10-spec.md`); // no work/ dir: not listed
    const abs = (...p) => path.join(root, '.claude-tweaks', 'pipelines', ...p);
    assert.deepStrictEqual(listHeaderDirs([root], 'R'), [
      { dir: abs('R', 'spec-2', 'work'), location: 'live', specN: 2, shape: 'nested', root },
      { dir: abs('R', 'spec-9', 'work'), location: 'live', specN: 9, shape: 'nested', root },
      { dir: abs('archive', 'R', 'work'), location: 'archived', specN: null, shape: 'flat', root },
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('listHeaderDirs: flat live work dir comes before nested ones; archived nested sorts numerically', () => {
  const root = tmp();
  try {
    put(root, `${P}/R/work/1-spec.md`);
    put(root, `${P}/R/spec-3/work/3-spec.md`);
    put(root, `${P}/archive/R/spec-10/work/10-spec.md`);
    put(root, `${P}/archive/R/spec-2/work/2-spec.md`);
    const got = listHeaderDirs([root], 'R').map((e) => [e.location, e.specN]);
    assert.deepStrictEqual(got, [
      ['live', null],
      ['live', 3],
      ['archived', 2],
      ['archived', 10],
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('listHeaderDirs: any spec-* dir is listed — numeric spec-N ascending first (specN a number), then non-numeric names lexically (specN null)', () => {
  const root = tmp();
  try {
    put(root, `${P}/R/spec-991-995/work/991-spec.md`);
    put(root, `${P}/R/spec-10/work/10-spec.md`);
    put(root, `${P}/R/spec-alpha/work/1-spec.md`);
    put(root, `${P}/R/spec-2/work/2-spec.md`);
    put(root, `${P}/R/notspec/work/3-spec.md`); // not spec-*: not listed
    const got = listHeaderDirs([root], 'R').map((e) => [path.basename(path.dirname(e.dir)), e.specN]);
    assert.deepStrictEqual(got, [
      ['spec-2', 2],
      ['spec-10', 10],
      ['spec-991-995', null],
      ['spec-alpha', null],
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('listHeaderDirs: a per-spec run lists only its own spec-N/work at both locations', () => {
  const root = tmp();
  try {
    put(root, `${P}/R/work/1-spec.md`);
    put(root, `${P}/R/spec-4/work/4-spec.md`);
    put(root, `${P}/R/spec-5/work/5-spec.md`);
    put(root, `${P}/archive/R/spec-4/work/4-spec.md`);
    const got = listHeaderDirs([root], 'R', { specN: 4 });
    assert.deepStrictEqual(got.map((e) => [e.location, e.specN]), [['live', 4], ['archived', 4]]);
    assert.strictEqual(got[0].dir, path.join(root, '.claude-tweaks', 'pipelines', 'R', 'spec-4', 'work'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('listHeaderDirs: roots in caller order; a missing root and junk roots never throw', () => {
  const r1 = tmp();
  const r2 = tmp();
  try {
    put(r1, `${P}/archive/R/work/1-spec.md`);
    put(r2, `${P}/R/work/1-spec.md`);
    const got = listHeaderDirs([path.join(r1, 'nope'), r1, r2, null], 'R').map((e) => [e.root, e.location]);
    assert.deepStrictEqual(got, [[r1, 'archived'], [r2, 'live']]);
    assert.deepStrictEqual(listHeaderDirs(undefined, 'R'), []);
  } finally {
    fs.rmSync(r1, { recursive: true, force: true });
    fs.rmSync(r2, { recursive: true, force: true });
  }
});

test('listHeaderDirs: every entry carries its shape — flat for a run\'s own work/, nested for spec-*/work/', () => {
  const root = tmp();
  try {
    put(root, `${P}/R/work/1-spec.md`);
    put(root, `${P}/R/spec-3/work/3-spec.md`);
    put(root, `${P}/archive/R/work/1-spec.md`);
    put(root, `${P}/archive/R/spec-alpha/work/1-spec.md`);
    assert.deepStrictEqual(
      listHeaderDirs([root], 'R').map((e) => [e.location, e.shape]),
      [['live', 'flat'], ['live', 'nested'], ['archived', 'flat'], ['archived', 'nested']],
    );
    assert.deepStrictEqual(listHeaderDirs([root], 'R', { specN: 3 }).map((e) => e.shape), ['nested']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// A run dir outside any .claude-tweaks/pipelines tree (a bare tmp fixture) has
// no checkout root; `runDir` makes the resolver read it directly (#3974).
test('findHeaderFiles: runDir of a root-less run dir yields its own work/ and spec-{n}/work/ header files', () => {
  const base = tmp();
  try {
    const runDir = path.join(base, 'R');
    const flat = put(runDir, 'work/5-spec.md');
    const nested = put(runDir, 'spec-5/work/5-spec.md');
    put(runDir, 'spec-6/work/5-spec.md'); // another spec's dir: not a candidate for 5
    assert.deepStrictEqual(findHeaderFiles([], 'R', 5, { runDir }), [flat, nested]);
    assert.deepStrictEqual(findHeaderFiles([], 'R', 5, { runDir, shape: 'nested' }), [nested]);
    assert.deepStrictEqual(findHeaderFiles([], 'R', 5, { runDir, specN: 7 }), [flat], 'per-spec: only the run dir\'s own work/');
    assert.deepStrictEqual(findHeaderFiles([], 'R', 5), [], 'without runDir the root-less dir is invisible');
    assert.deepStrictEqual(findHeaderFiles([], 'R', 99, { runDir }), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('listHeaderDirs: runDir of a root-less run dir lists its work/ (flat) and spec-*/work/ (nested) as live, root null', () => {
  const base = tmp();
  try {
    const runDir = path.join(base, 'R');
    put(runDir, 'work/1-spec.md');
    put(runDir, 'spec-9/work/9-spec.md');
    put(runDir, 'spec-2/work/2-spec.md');
    assert.deepStrictEqual(listHeaderDirs([], 'R', { runDir }), [
      { dir: path.join(runDir, 'work'), location: 'live', specN: null, shape: 'flat', root: null },
      { dir: path.join(runDir, 'spec-2', 'work'), location: 'live', specN: 2, shape: 'nested', root: null },
      { dir: path.join(runDir, 'spec-9', 'work'), location: 'live', specN: 9, shape: 'nested', root: null },
    ]);
    assert.deepStrictEqual(listHeaderDirs([], 'R', { runDir, specN: 4 }).map((e) => e.dir), [path.join(runDir, 'work')], 'per-spec: its own work/ only');
    assert.deepStrictEqual(listHeaderDirs([], 'R'), []);
    assert.deepStrictEqual(listHeaderDirs([], 'R', { runDir: path.join(base, 'absent') }), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('runDir is inert when the run dir sits under a .claude-tweaks/pipelines tree (the root-based lookup already covers it)', () => {
  const root = tmp();
  try {
    const runDir = path.join(root, '.claude-tweaks', 'pipelines', 'R');
    const live = put(root, `${P}/R/work/5-spec.md`);
    assert.deepStrictEqual(findHeaderFiles([root], 'R', 5, { runDir }), [live]);
    assert.deepStrictEqual(listHeaderDirs([root], 'R', { runDir }).map((e) => e.root), [root]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checkoutRootOf: the native path before the last .claude-tweaks/pipelines pair', () => {
  assert.strictEqual(
    checkoutRootOf(path.join('/a', 'b', '.claude-tweaks', 'pipelines', 'R')),
    path.join('/a', 'b'),
  );
  assert.strictEqual(
    checkoutRootOf(path.join('/a', 'b', '.claude-tweaks', 'pipelines', 'archive', 'R', 'spec-3')),
    path.join('/a', 'b'),
  );
  // The last pair wins when a checkout itself sits under a pipelines tree.
  assert.strictEqual(
    checkoutRootOf(path.join('/a', '.claude-tweaks', 'pipelines', 'x', '.claude-tweaks', 'pipelines', 'R')),
    path.join('/a', '.claude-tweaks', 'pipelines', 'x'),
  );
});

test('checkoutRootOf: null without a .claude-tweaks/pipelines pair', () => {
  assert.strictEqual(checkoutRootOf(path.join('/a', 'b', 'c')), null);
  assert.strictEqual(checkoutRootOf(path.join('/a', '.claude-tweaks', 'policy.yml')), null);
  assert.strictEqual(checkoutRootOf(''), null);
  assert.strictEqual(checkoutRootOf(undefined), null);
});
