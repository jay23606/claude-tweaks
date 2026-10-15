# visual-decide stop zombie-PID marker fix (#3130) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `visual-decide`'s `stop` command write the `server-stopped` marker even when `waitFor` times out waiting on a zombie PID, so the stale-PID-tolerant contract holds under a non-reaping init (e.g. Firecracker `process_api`), not just under the ESRCH dead-PID path.

**Architecture:** `cmdStop` in `plugin/bin/lib/visual-decide/cli.js` already has a branch (lines 190-197) that defensively writes `server-stopped` when the target PID is already dead (ESRCH). The live-PID branch sends `SIGTERM` then calls `waitFor(...)` with a 3000ms timeout, and currently prints `stopped` unconditionally regardless of whether `waitFor` actually observed the marker or a dead PID, or merely timed out. On a zombie PID (reparented to a non-reaping init-equivalent), `pidAlive` keeps reporting `true` forever (it only signals, never reaps), so the marker is never written and `waitFor` always times out. Fix: capture `waitFor`'s return value and, when it's falsy (timeout), write the marker defensively — same best-effort `try`/`catch fs.writeFileSync` shape as the existing dead-PID branch.

**Tech Stack:** Node.js built-ins only (`node:fs`, `node:child_process`) — this module has a hard zero-non-builtin-imports constraint (AC8 in the existing test file).

**Spec:** `.claude-tweaks/pipelines/2026-10-15T171116-record-3130/work/3130-spec.md` (materialized from GitHub issue #3130)

## Global Constraints

- Zero non-builtin imports in `plugin/bin/lib/visual-decide/cli.js` (existing AC8 test; already enforced, this change must not violate it).
- No change to `pidAlive`'s EPERM/ESRCH semantics (`cli.js:43-52`) — spec AC2.
- Existing stop/status test coverage for the non-zombie dead-PID path (ESRCH) must still pass unchanged — spec AC3.
- This macOS sandbox's PID 1 (`launchd`) reaps children normally, so the exact zombie scenario (a SIGKILLed child reparented to a non-reaping init) cannot be organically produced here. The new test below exercises the same code path (`waitFor` times out because the target PID stays signalable while the marker never appears) using an ordinary long-lived child process that ignores `SIGTERM`, which is an equally valid trigger for the `waitFor`-timeout branch regardless of *why* the PID stays alive.

## Review Focus

- **Timeout-triggers-marker-write is the actual new behavior** — a reviewer should confirm the new test fails without the fix (predicate always false → marker absent) and passes with it, not just that the existing suite stays green.
- **The ESRCH/ TOCTOU branches above the new code must be untouched** — a diff that touches lines 190-212 at all is broader than this spec's scope.
- **The defensive write must stay best-effort** (`try { } catch { }`, like its sibling branches) — an unguarded `fs.writeFileSync` here would newly throw inside `cmdStop` on a read-only or already-cleaned-up `stateDir`, a regression the existing branches already avoid.
- **`waitFor`'s return value must be used, not re-derived** — re-checking `fs.existsSync(...) || !pidAlive(info.pid)` again after the call (instead of using the value `waitFor` already returned) would reintroduce a second TOCTOU window and duplicate the predicate.
- **The new child process spawned for the test must be cleaned up** (`SIGKILL` + wait) even if the test assertion fails, or it leaks a process that ignores `SIGTERM` into the CI/sandbox environment.

---

### Task 1: Defensive marker write on `cmdStop`'s `waitFor` timeout

**Files:**
- Modify: `plugin/bin/lib/visual-decide/cli.js:213-217`
- Test: `tests/bin-lib/visual-decide/cli.test.js`

**Interfaces:**
- Consumes: `waitFor(fn, {timeoutMs, intervalMs})` (already defined, `cli.js:75-84`) — returns the predicate's truthy return value on success, `null` on timeout. No signature change.
- Produces: no new exported symbols — `cmdStop`'s external behavior (exit code 0, `stdout` `"stopped\n"`) is unchanged; only the marker-file side effect on timeout is new.

- [ ] **Step 1: Write the failing test**

Add to `tests/bin-lib/visual-decide/cli.test.js` (after the existing "stop is stale-PID tolerant" test, around line 117):

```javascript
test('stop writes server-stopped marker defensively when waitFor times out on a still-signalable PID', async () => {
  const stateDir = mkTmp('vd-state-');
  fs.mkdirSync(stateDir, { recursive: true });

  // Simulate a PID that stays signalable (kill(pid, 0) keeps succeeding) but
  // never exits and never writes the marker itself -- the same shape a
  // zombie child presents to pidAlive() under a non-reaping init, without
  // needing an actual zombie (this sandbox's PID 1 reaps normally).
  const stuck = spawn(process.execPath, ['-e', 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);'], {
    stdio: 'ignore',
  });
  await new Promise((resolve) => {
    stuck.once('spawn', resolve);
  });

  fs.writeFileSync(
    path.join(stateDir, 'server-info'),
    JSON.stringify({ pid: stuck.pid, port: 0, url: 'http://127.0.0.1:0/', key: 'test' }),
  );

  try {
    const stopResult = run(['stop', '--state', stateDir]);
    assert.equal(stopResult.code, 0, stopResult.err);
    assert.equal(stopResult.out.trim(), 'stopped');
    assert.equal(
      fs.existsSync(path.join(stateDir, 'server-stopped')),
      true,
      'server-stopped marker must be written even when waitFor times out on a still-signalable PID',
    );
  } finally {
    stuck.kill('SIGKILL');
  }
});
```

Add `const { spawn } = require('node:child_process');` to the test file's requires at the top (it currently has no `child_process` import of its own beyond `execFileSync`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/visual-decide/cli.test.js`
Expected: FAIL — the new test's `assert.equal(fs.existsSync(...), true, ...)` fails because `cmdStop` currently prints `stopped` without ever writing the marker on a `waitFor` timeout. (Test duration ~3s, matching the hardcoded 3000ms `timeoutMs` in `cmdStop`'s `waitFor` call.)

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/visual-decide/cli.js`, replace the `waitFor` call at the end of `cmdStop` (lines 213-217):

```javascript
  const settled = await waitFor(
    () => fs.existsSync(path.join(stateDir, 'server-stopped')) || !pidAlive(info.pid),
    { timeoutMs: 3000, intervalMs: 50 },
  );
  if (!settled) {
    // waitFor timed out: on a zombie PID (no reaping init) pidAlive(pid)
    // keeps answering true via kill(pid, 0) even though the process can no
    // longer run its own SIGTERM handler to write the marker itself. Write
    // it defensively here, matching the dead-PID branch's own behavior
    // above (lines 190-197) -- stop is a stale-PID-tolerant contract
    // regardless of which branch gets there.
    try {
      fs.writeFileSync(path.join(stateDir, 'server-stopped'), '');
    } catch {
      // best-effort
    }
  }
  process.stdout.write('stopped\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/visual-decide/cli.test.js`
Expected: PASS — all tests in the file, including the new one and the pre-existing "stop is stale-PID tolerant (dead PID -> already-stopped, exit 0)" and `#1231` EPERM/ESRCH tests.

- [ ] **Step 5: Re-run 3x to confirm no regression (spec AC1)**

Run: `node --test tests/bin-lib/visual-decide/cli.test.js` three consecutive times.
Expected: PASS every time, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/visual-decide/cli.js tests/bin-lib/visual-decide/cli.test.js
git commit -m "fix: visual-decide stop: write server-stopped marker on waitFor timeout

refs #3130"
```

---

## Self-review

- **Spec coverage:** Deliverable (a) (defensive marker write on `waitFor` timeout, matching the dead-PID branch) is Task 1 Steps 3-4. AC1 (reliable 3x pass) is Task 1 Step 5. AC2 (no `pidAlive` EPERM/ESRCH change) is satisfied by construction — Task 1 touches only lines 213-217, nowhere near `pidAlive` (lines 43-52). AC3 (existing non-zombie dead-PID coverage unchanged) is covered by Step 4 re-running the full file, including the untouched `#1231` test and the pre-existing "stale-PID tolerant" test.
- **Placeholders:** none.
- **Type consistency:** `waitFor`'s return value (`value` on success, `null` on timeout per its existing implementation at `cli.js:75-84`) is used directly as `settled`; no new types introduced.
- **Review Focus:** all five lines above each map to a concrete check in Task 1's steps or interfaces block.
