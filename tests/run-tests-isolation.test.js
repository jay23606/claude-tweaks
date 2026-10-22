// tests/run-tests-isolation.test.js
//
// #3969: running many full suites at once (sibling worktrees, sessions) overloaded the dev
// machine. tools/run-tests.js bounds its own load: `--test-concurrency` defaults to half the
// cores (CT_TEST_CONCURRENCY overrides) and a cross-process slot semaphore caps simultaneous
// suites (CT_TEST_SUITE_SLOTS). This pins the pure helpers; `platform`/`nodeMajor`/`env` are
// parameters, never a stubbed `process` in this process.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const {
  resolveConcurrency, resolveSlots, listTestFiles, buildTestArgs,
  isPidAlive, acquireSlot, releaseSlot, createRunRoot, sweepStaleRoots,
} = require(path.join(ROOT, 'tools', 'run-tests.js'));

test('resolveConcurrency defaults to half the cores, at least 1', () => {
  assert.strictEqual(resolveConcurrency({}, 12), 6);
  assert.strictEqual(resolveConcurrency({}, 1), 1);
  assert.strictEqual(resolveConcurrency({}, 3), 1);
});

test('resolveConcurrency honors a positive-integer CT_TEST_CONCURRENCY', () => {
  assert.strictEqual(resolveConcurrency({ CT_TEST_CONCURRENCY: '3' }, 12), 3);
});

test('resolveConcurrency ignores an invalid CT_TEST_CONCURRENCY', () => {
  for (const bad of ['0', '-2', 'abc', '2.5']) {
    assert.strictEqual(resolveConcurrency({ CT_TEST_CONCURRENCY: bad }, 12), 6, bad);
  }
});

test('resolveSlots defaults to 1', () => {
  const lines = [];
  assert.strictEqual(resolveSlots({}, (l) => lines.push(l)), 1);
  assert.deepStrictEqual(lines, []);
});

test('resolveSlots honors CT_TEST_SUITE_SLOTS=3', () => {
  assert.strictEqual(resolveSlots({ CT_TEST_SUITE_SLOTS: '3' }, () => {}), 3);
});

test('resolveSlots: an invalid value falls back to 1 and logs one line naming CT_TEST_SUITE_SLOTS', () => {
  for (const bad of ['0', '-2', 'abc', '2.5']) {
    const lines = [];
    assert.strictEqual(resolveSlots({ CT_TEST_SUITE_SLOTS: bad }, (l) => lines.push(l)), 1, bad);
    assert.strictEqual(lines.length, 1, bad);
    assert.match(lines[0], /CT_TEST_SUITE_SLOTS/);
  }
});

test('listTestFiles accepts an absolute root', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-abs-root-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.test.js'), '');
    fs.writeFileSync(path.join(tmp, 'b.js'), '');
    assert.deepStrictEqual(listTestFiles(ROOT, [tmp]), [path.join(tmp, 'a.test.js')]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('buildTestArgs rejects a non-positive-integer concurrency; a valid one still reaches the win32/Node 20 error', () => {
  for (const bad of [undefined, 0, -1, 2.5, '4', NaN]) {
    assert.throws(() => buildTestArgs([], [], { platform: 'linux', nodeMajor: 22, concurrency: bad }), /concurrency/, String(bad));
  }
  assert.throws(() => buildTestArgs([], ['tests'], { platform: 'win32', nodeMajor: 20, concurrency: 4 }), /Node >= 22/);
});

// The slot lock and run-root helpers take `isAlive`, `now`, `sleep` and `log` as parameters, so
// these tests use fake pids (111/222/...) and a Set of "alive" ones — never a real process.
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-slot-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function slotArgs(dir, over) {
  return { dir, slots: 1, pid: 111, cwd: '/work/a', isAlive: () => false, now: Date.now, log: () => {}, sleep: () => {}, ...over };
}

function writeLock(dir, i, pid) {
  const p = path.join(dir, `slot-${i}.lock`);
  fs.writeFileSync(p, JSON.stringify({ pid, startedAt: '2026-01-01T00:00:00.000Z', cwd: '/work/other' }));
  return p;
}

test('acquireSlot takes a free slot', () => {
  withTempDir((dir) => {
    const lock = acquireSlot(slotArgs(dir));
    assert.strictEqual(lock, path.join(dir, 'slot-0.lock'));
    const held = JSON.parse(fs.readFileSync(lock, 'utf8'));
    assert.strictEqual(held.pid, 111);
    assert.strictEqual(held.cwd, '/work/a');
  });
});

test("acquireSlot reclaims a dead holder's lock without sleeping", () => {
  withTempDir((dir) => {
    writeLock(dir, 0, 222);
    const sleep = () => { throw new Error('sleep must not be called'); };
    const lock = acquireSlot(slotArgs(dir, { sleep, isAlive: (pid) => pid === 111 }));
    assert.strictEqual(lock, path.join(dir, 'slot-0.lock'));
    assert.strictEqual(JSON.parse(fs.readFileSync(lock, 'utf8')).pid, 111);
  });
});

// Two waiters can both judge the same dead lock stale. The loser of the reclaim must not delete
// the winner's live lock: the stale verdict is re-checked under a per-slot `.reclaim` mutex.
test("acquireSlot does not delete a live winner's lock that lands after the stale verdict", () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 222);
    let swapped = false;
    const isAlive = (pid) => {
      if (pid === 222 && !swapped) {
        swapped = true;
        writeLock(dir, 0, 333); // another process reclaims and takes the slot right after our verdict
        return false;
      }
      return pid === 333;
    };
    let sleeps = 0;
    const sleep = () => {
      sleeps += 1;
      assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 333, "the winner's lock must survive");
      fs.unlinkSync(p);
    };
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep, isAlive })), p);
    assert.strictEqual(sleeps, 1);
    assert.ok(!fs.existsSync(path.join(dir, 'slot-0.reclaim')));
  });
});

test('acquireSlot does not reclaim a slot whose fresh .reclaim mutex is held by someone else', () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 222);
    const mutex = path.join(dir, 'slot-0.reclaim');
    fs.writeFileSync(mutex, '');
    let sleeps = 0;
    const sleep = () => {
      sleeps += 1;
      assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 222, 'not reclaimed on the first scan');
      fs.unlinkSync(mutex);
    };
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep })), p);
    assert.strictEqual(sleeps, 1);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 111);
  });
});

test('acquireSlot clears an old .reclaim mutex left by a crashed reclaimer and reclaims', () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 222);
    const mutex = path.join(dir, 'slot-0.reclaim');
    fs.writeFileSync(mutex, '');
    const old = new Date(Date.now() - 31 * 1000);
    fs.utimesSync(mutex, old, old);
    const sleep = () => { throw new Error('sleep must not be called'); };
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep })), p);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 111);
    assert.ok(!fs.existsSync(mutex));
  });
});

test('a lock carrying pid 0 is not live forever: it counts as unparseable and is reclaimed once old', () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 0);
    const old = new Date(Date.now() - 11 * 60 * 1000);
    fs.utimesSync(p, old, old);
    const sleep = () => { throw new Error('sleep must not be called'); };
    // isAlive says yes to everything: only the pid > 0 requirement can make this lock reclaimable.
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep, isAlive: () => true })), p);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 111);
  });
});

test('acquireSlot reclaims an old unparseable lock', () => {
  withTempDir((dir) => {
    const p = path.join(dir, 'slot-0.lock');
    fs.writeFileSync(p, '');
    const old = new Date(Date.now() - 11 * 60 * 1000);
    fs.utimesSync(p, old, old);
    const sleep = () => { throw new Error('sleep must not be called'); };
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep })), p);
    assert.strictEqual(JSON.parse(fs.readFileSync(p, 'utf8')).pid, 111);
  });
});

test('a fresh unparseable lock is waited on, not reclaimed', () => {
  withTempDir((dir) => {
    const p = path.join(dir, 'slot-0.lock');
    fs.writeFileSync(p, '');
    let sleeps = 0;
    const sleep = () => { sleeps += 1; fs.unlinkSync(p); };
    assert.strictEqual(acquireSlot(slotArgs(dir, { sleep })), p);
    assert.strictEqual(sleeps, 1);
  });
});

test('acquireSlot waits for a live holder, logs once, then acquires', () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 333);
    const lines = [];
    let sleeps = 0;
    const sleep = (ms) => {
      sleeps += 1;
      assert.strictEqual(ms, 2000);
      if (sleeps === 2) fs.unlinkSync(p);
    };
    const lock = acquireSlot(slotArgs(dir, { sleep, log: (l) => lines.push(l), isAlive: (pid) => pid === 333 }));
    assert.strictEqual(lock, p);
    assert.strictEqual(sleeps, 2);
    assert.strictEqual(lines.length, 1);
    assert.strictEqual(
      lines[0],
      'run-tests.js: waiting for a test-suite slot — held by pid 333 (cwd /work/other) since 2026-01-01T00:00:00.000Z; set CT_TEST_SUITE_SLOTS to raise the limit',
    );
  });
});

test('acquireSlot uses a second slot when slots=2', () => {
  withTempDir((dir) => {
    writeLock(dir, 0, 333);
    const sleep = () => { throw new Error('sleep must not be called'); };
    const lock = acquireSlot(slotArgs(dir, { slots: 2, sleep, isAlive: (pid) => pid === 333 }));
    assert.strictEqual(lock, path.join(dir, 'slot-1.lock'));
  });
});

test("releaseSlot leaves another pid's lock alone", () => {
  withTempDir((dir) => {
    const p = writeLock(dir, 0, 444);
    releaseSlot(p, 111);
    assert.ok(fs.existsSync(p));
    releaseSlot(p, 444);
    assert.ok(!fs.existsSync(p));
  });
});

test('releaseSlot never throws on a missing or unparseable lock', () => {
  withTempDir((dir) => {
    assert.doesNotThrow(() => releaseSlot(path.join(dir, 'slot-0.lock'), 111));
    const p = path.join(dir, 'slot-1.lock');
    fs.writeFileSync(p, 'not json');
    assert.doesNotThrow(() => releaseSlot(p, 111));
    assert.ok(fs.existsSync(p));
  });
});

test('createRunRoot makes ct-testrun-<pid>-* under the given tmp dir', () => {
  withTempDir((dir) => {
    const root = createRunRoot(dir, 777);
    assert.strictEqual(path.dirname(root), dir);
    assert.match(path.basename(root), /^ct-testrun-777-/);
    assert.ok(fs.statSync(root).isDirectory());
  });
});

test('sweepStaleRoots removes dead-pid roots and keeps live ones', () => {
  withTempDir((dir) => {
    for (const name of ['ct-testrun-555-aaaaaa', 'ct-testrun-666-bbbbbb', 'other-dir']) {
      fs.mkdirSync(path.join(dir, name));
    }
    fs.writeFileSync(path.join(dir, 'ct-testrun-555-aaaaaa', 'junk'), 'x');
    const removed = sweepStaleRoots({ dir, isAlive: (pid) => pid === 666 });
    assert.deepStrictEqual(removed, [path.join(dir, 'ct-testrun-555-aaaaaa')]);
    assert.ok(!fs.existsSync(path.join(dir, 'ct-testrun-555-aaaaaa')));
    assert.ok(fs.existsSync(path.join(dir, 'ct-testrun-666-bbbbbb')));
    assert.ok(fs.existsSync(path.join(dir, 'other-dir')));
  });
});

test('isPidAlive is true for this process and false for an exited child', () => {
  assert.strictEqual(isPidAlive(process.pid), true);
  // pid 0 / negative would probe a process group, not a process — never "alive".
  for (const bad of [0, -1, 1.5, NaN]) assert.strictEqual(isPidAlive(bad), false, String(bad));
  const child = spawnSync(process.execPath, ['-e', '0']);
  assert.ok(child.pid > 0);
  assert.strictEqual(isPidAlive(child.pid), false);
});

// Runs tools/run-tests.js as a real child over a throwaway root holding only the probe fixture
// (copied in as probe.test.js — the fixture's own name is not collected by the real suite), with a
// private slot dir. `inspect({ result, probeOut, slotDir })` runs before the temp dirs go; every
// temp dir is removed in `finally`. `CT_TEST_SUITE_SLOT_HELD` is cleared first: the suite this test
// runs inside has it set to 1.
function runProbe({ env: extraEnv = {}, timeout = 120000, setup, inspect }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-probe-'));
  try {
    const suiteRoot = path.join(tmp, 'suite');
    const slotDir = path.join(tmp, 'slots');
    const probeOut = path.join(tmp, 'probe-out.json');
    fs.mkdirSync(suiteRoot);
    fs.mkdirSync(slotDir);
    fs.copyFileSync(
      path.join(ROOT, 'tests', 'fixtures', 'run-tests', 'tmpdir-probe.fixture.js'),
      path.join(suiteRoot, 'probe.test.js'),
    );
    if (setup) setup({ slotDir });
    // A private tmpdir for the child: its startup sweep scans `os.tmpdir()`, and on a machine with
    // years of leaked fixtures in the real one (millions of entries) that scan alone outlasts the
    // spawn timeout. The sweep itself is pinned directly above.
    const childTmp = path.join(tmp, 'tmp');
    fs.mkdirSync(childTmp);
    const env = { ...process.env, CT_PROBE_OUT: probeOut, CT_TEST_SUITE_SLOT_DIR: slotDir, TMPDIR: childTmp, TMP: childTmp, TEMP: childTmp };
    delete env.CT_TEST_SUITE_SLOT_HELD;
    // Set by the `node --test` this test runs under: left in, the child's own `node --test` would
    // act as a nested worker and run nothing.
    delete env.NODE_TEST_CONTEXT;
    Object.assign(env, extraEnv);
    const result = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'run-tests.js'), suiteRoot], {
      cwd: ROOT, env, encoding: 'utf8', timeout,
    });
    inspect({ result, probeOut, slotDir });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

test('run-tests.js runs the suite under a ct-testrun-* TMPDIR it removes on exit', () => {
  runProbe({
    inspect({ result, probeOut, slotDir }) {
      assert.strictEqual(result.status, 0, result.stdout + result.stderr);
      const recorded = JSON.parse(fs.readFileSync(probeOut, 'utf8'));
      assert.match(path.basename(recorded.tmpdir), /^ct-testrun-\d+-/);
      assert.strictEqual(fs.existsSync(recorded.tmpdir), false);
      assert.strictEqual(recorded.held, '1');
      assert.deepStrictEqual(fs.readdirSync(slotDir).filter((n) => /^slot-.*\.lock$/.test(n)), []);
    },
  });
});

test('a nested run with CT_TEST_SUITE_SLOT_HELD=1 skips the slot', () => {
  // A live holder (this process) would block a run that tried to take the only slot.
  const lockText = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), cwd: ROOT });
  runProbe({
    env: { CT_TEST_SUITE_SLOT_HELD: '1' },
    timeout: 60000,
    setup({ slotDir }) {
      fs.writeFileSync(path.join(slotDir, 'slot-0.lock'), lockText);
    },
    inspect({ result, slotDir }) {
      assert.strictEqual(result.status, 0, result.stdout + result.stderr);
      assert.strictEqual(fs.readFileSync(path.join(slotDir, 'slot-0.lock'), 'utf8'), lockText);
    },
  });
});
