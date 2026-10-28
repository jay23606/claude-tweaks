# Dev-server identity verification (#3731) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every stop of a pipeline's ephemeral dev server goes through one executable helper, `plugin/bin/dev-server.js`, which identifies the server by `(pid, start time)` for both its shell leader and its listener, so a reused pid is never signalled and an unrelated port holder is never blamed.

**Architecture:** A `plugin/bin/lib/dev-server/` module (identity probes, the server-record reader/writer, the stop decision) behind an injectable runner, and a two-verb CLI (`record`, `stop`) that the skill prose calls instead of restating `kill`/`taskkill`/`lsof`. `record` writes today's one-line `ephemeral-server.txt` unchanged plus an `ephemeral-server.json` identity sidecar; `stop` verifies identities, signals, checks the port, deletes or keeps the record, and appends its own `decisions.md` entries.

**Tech Stack:** Node 18+ CommonJS, `node --test`, `child_process.execFileSync` behind a `runner` seam; POSIX `ps`/`lsof`/`ss`; win32 PowerShell `Get-CimInstance`/`Get-NetTCPConnection` and `taskkill`.

**Spec:** `.claude-tweaks/pipelines/2026-10-28T161519-record-3731/work/3731-spec.md` (materialized from GitHub issue #3731)

**Scope keywords:** ephemeral-server, Section D steps 2-4, taskkill, Never hand-roll a kill

## Global Constraints

- The txt line keeps its format `{pid} {port} {worktree-root} detached:{yes|no}`, parsed by token: pid and port are the first two fields, `detached:` is the trailing (last) token, the worktree root is everything between them (it may contain spaces). Never parse by whitespace position.
- A process is identified by `(pid, start time)`. POSIX start time: `ps -o pgid=,lstart= -p {pid}` run with `env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }` (the convention `plugin/bin/lib/run-liveness/process-probe.js`'s `psEnv` documents), stored as the raw trimmed `lstart` string and compared by equality only, never parsed. win32: `(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CreationDate.ToUniversalTime().ToString('o')` via `powershell -NoProfile -NonInteractive -Command`.
- Fail direction (spec, verbatim): "an identity the helper cannot read (no `ps`, a CIM failure) is unprovable, so it signals nothing and reports a cleanup failure, keeping the record. A leaked dev server is recoverable; a killed unrelated process is not."
- Legacy record (no sidecar): today's behavior, logged once as `identity unverified (legacy record)`. Removal condition, stated in `plugin/bin/lib/dev-server/stop.js`'s header and in Section D: remove the legacy branch once no non-archived run directory under `.claude-tweaks/pipelines/` holds an `ephemeral-server.txt` without an `ephemeral-server.json` beside it, on a plugin build newer than the first release that ships `bin/dev-server.js`.
- `bin/` CLIs must not read `CLAUDE_PLUGIN_ROOT` at runtime; follow the existing CLIs' process-cwd anchoring (spec Gotcha).
- `gh-api-module-pattern` skill (governs `plugin/bin/` CLIs that shell out via `execFileSync`), quoted: "Logic lives in an exported `run(argv, deps)`; every side effect (`runner`, `ghAvailable`, `remoteUrl`, `stdout`, `stderr`) goes through `deps` so tests inject fakes. **Every** `deps` call that can throw (e.g. `remoteUrl` outside a git repo) is try/caught into the documented exit-code contract" · "`require.main === module` guard sets `process.exitCode = run(...)` (never `process.exit`, which can truncate piped stdout). `--help` short-circuits before any availability probe." · "Every malformed-input class must actually reach its malformed code — `Number('') === 0` passes `Number.isInteger`, so validate positivity and pair-structure explicitly." · "A value-taking flag given as the last argv element reads `undefined` … Validate the value inside `parseArgs` … `typeof v !== 'string' || !v.trim() || v.startsWith('--')` returns a usage error — and pin both the trailing bare flag and the empty-string value with their own test cases." · "A CLI that reports a decision as data logs that entry itself; the skill hand-logs it only when the CLI reports the append failed." · flag lookup with `Object.hasOwn(FLAGS, a)`, never `a in FLAGS`.
- Source-scan lints over `plugin/bin/`: every `child_process` call passes `windowsHide: true` (`tests/windows-hide-spawn-conformance.test.js`); no `fs.existsSync` / `fs.realpathSync` tokens anywhere (`tests/path-guard-conformance.test.js`) — read the record with `fs.readFileSync` in a `try` and treat `ENOENT` as absent, or use `plugin/bin/lib/path-guard`'s `lstatType`.
- `windows-checkout-test-parity` skill: take `platform` as a parameter (never read `process.platform` inside the logic), so win32 branches are unit-tested on the POSIX CI host.
- Skill-prose files near the Read rail (`RAIL_BYTES` = 52500): `plugin/skills/flow/multispec-review-console.md` is 51235 bytes and `plugin/skills/dispatch/task-prompt.md` 49154 at the merge base — edits there must be net ≤ +300 bytes each (replace restated prose, don't add beside it).
- Commits: `{Verb} {what} — {detail}` style, body line `refs #3731` (never `closes`/`fixes`).

## Review Focus

1. A stale sidecar: a restart that rewrote `ephemeral-server.txt` with the old `printf` (an older installed build, or a hand restart) leaves an `ephemeral-server.json` naming a different pid/port — `stop` must treat the sidecar as stale (legacy branch, reason `stale-sidecar`), never verify the new pid against the old start time. Test in Task 3.
2. `lsof` exits 1 both for "no listener" and for a failure — only exit 1 with empty stdout **and** empty stderr is "no listener"; anything else is unreadable. Test in Task 1.
3. A sidecar whose leader start time is `null` (identity unavailable at record time) must signal nothing and keep the record (`identity-unreadable`), not fall through to an unverified kill. Test in Task 3.
4. A port holder after a stop when the listener identity was never recorded and the holder is not in the verified leader's group: unprovable → `identity-unreadable`, record kept — never `unrelated-holder` (which deletes the record). Test in Task 3.
5. A worktree root containing spaces round-trips through `record` → txt → `stop`'s parse, and `stop --worktree` compares the whole root. Test in Tasks 2 and 4.

---

### Task 1: Identity probes

**Role:** integration
**Review risk:** high

**Files:**
- Create: `plugin/bin/lib/dev-server/identity.js`
- Test: `tests/bin-lib/dev-server/identity.test.js`

**Interfaces:**
- Produces:
  - `readIdentity(pid: number, { platform: string, runner: (cmd, args, opts) => string }) → { ok: true, alive: false } | { ok: true, alive: true, startTime: string, pgid: number|null } | { ok: false, error: string }` — `runner` has `execFileSync`'s contract (returns stdout, throws an error carrying `status`, `stdout`, `stderr`, `code`).
  - `findListeners(port: number, { platform, runner }) → { ok: true, pids: number[] } | { ok: false, error: string }`
  - `defaultRunner(cmd, args, opts)` — `execFileSync` with `{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, windowsHide: true, ...opts }`.

- [ ] **Step 1: Failing tests** (fake runner keyed on `cmd + ' ' + args.join(' ')`, returning stdout or throwing `{ status, stdout, stderr }` / `{ code: 'ENOENT' }`):
  - `readIdentity POSIX alive`: `ps` prints `' 84769 Wed Oct 28 17:19:34 2026\n'` → `{ ok: true, alive: true, startTime: 'Wed Oct 28 17:19:34 2026', pgid: 84769 }`; assert the runner got `['-o', 'pgid=,lstart=', '-p', '84769']` and `opts.env.LC_ALL === 'C' && opts.env.TZ === 'UTC'`.
  - `readIdentity POSIX gone`: `ps` throws `{ status: 1, stdout: '', stderr: '' }` → `{ ok: true, alive: false }`.
  - `readIdentity POSIX ps missing`: throws `{ code: 'ENOENT' }` → `ok: false`.
  - `readIdentity POSIX unparseable output` (`'garbage'`) → `ok: false`.
  - `readIdentity win32 alive/gone/CIM failure`: PowerShell prints `'2026-10-28T16:19:34.1234567Z\n'` → `alive: true, pgid: null`; prints `''` (exit 0) → `alive: false`; throws `{ status: 1, stderr: 'x' }` → `ok: false`.
  - `findListeners via lsof`: `lsof -nP -iTCP:3001 -sTCP:LISTEN -t` prints `'84774\n'` → `{ ok: true, pids: [84774] }`; throws `{ status: 1, stdout: '', stderr: '' }` → `pids: []`; throws `{ status: 1, stdout: '', stderr: 'lsof: WARNING' }` → `ok: false`.
  - `findListeners falls back to ss when lsof is absent`: lsof throws ENOENT, `ss -ltnpH sport = :3001` prints `'LISTEN 0 511 127.0.0.1:3001 0.0.0.0:* users:(("node",pid=84774,fd=21))\n'` → `pids: [84774]`; both ENOENT → `ok: false`.
  - `findListeners win32`: `Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess` prints `'4242\r\n4242\r\n'` → `pids: [4242]` (deduped; CRLF tolerated); exit 0 `''` → `[]`.
  - Invalid pid/port (0, -1, 1.5, NaN) → `ok: false` without calling the runner.
  Run: `node --test tests/bin-lib/dev-server/identity.test.js` — Expected: FAIL (module not found).
- [ ] **Step 2: Implement** `identity.js` with the signatures above; `platform` is a parameter, never `process.platform`.
- [ ] **Step 3: Run** `node --test tests/bin-lib/dev-server/identity.test.js tests/windows-hide-spawn-conformance.test.js tests/path-guard-conformance.test.js` — PASS.
- [ ] **Step 4: Commit** — `Add dev-server identity probes — (pid, start time) and port listeners per platform`.

---

### Task 2: Server record read/write

**Role:** integration

**Files:**
- Create: `plugin/bin/lib/dev-server/record.js`
- Test: `tests/bin-lib/dev-server/record.test.js`

**Interfaces:**
- Consumes: Task 1 `readIdentity`, `findListeners`.
- Produces:
  - `TXT = 'ephemeral-server.txt'`, `SIDECAR = 'ephemeral-server.json'`
  - `parseRecordLine(line: string) → { ok: true, pid, port, worktree, detached: 'yes'|'no' } | { ok: false, reason: string }` — `ok: false` for fewer than four fields, a pid or port that is not a positive integer, or no trailing `detached:yes|no` token.
  - `formatRecordLine({ pid, port, worktree, detached }) → string` (with trailing `\n`)
  - `readRecord(dir) → { present: false } | { present: true, line: string, parsed, sidecar: object|null, sidecarError: string|null }` — `sidecar` null with `sidecarError: null` when the json file is absent; unreadable / non-object / wrong `version` → `sidecar: null, sidecarError: 'unreadable'`.
  - `recordServer({ dir, pid, port, worktree, detached, platform, runner, now: () => Date }) → { txt, json, leader, listener, identityErrors: string[] }` — writes the sidecar first, then the txt line, each through `plugin/bin/lib/atomic-write.js`. Sidecar shape: `{ version: 1, pid, port, worktree, detached, platform, recordedAt, leader: { pid, startTime: string|null, pgid: number|null }, listener: { pid, startTime } | null, identityErrors }`. `identityErrors` values: `leader-unreadable`, `leader-not-running`, `listener-lookup-failed`, `no-listener`, `listener-unreadable`.
  - `deleteRecord(dir)` — removes both files, `ENOENT` tolerated.

- [ ] **Step 1: Failing tests:**
  - `parseRecordLine` accepts `'123 3001 /Users/x/Code Workspaces/wt detached:yes'` → worktree `'/Users/x/Code Workspaces/wt'`; rejects `'123 3001 detached:no'` (three fields), `'0 3001 /w detached:no'`, `'123 abc /w detached:no'`, `'123 3001 /w'`, `'123 3001 /w detached:maybe'`.
  - `recordServer` round trip in a `fs.mkdtempSync` dir with a fake identity runner (leader alive `pgid 500`, listener pid 501 alive): the txt equals `formatRecordLine(...)` byte-for-byte, the sidecar parses with `leader.startTime` and `listener.pid === 501`, `identityErrors: []`; `readRecord(dir)` returns both.
  - Leader ps throws ENOENT → sidecar `leader.startTime === null`, `identityErrors` includes `leader-unreadable`, both files still written.
  - No listener (lsof exit 1, empty) → `listener: null`, `identityErrors` includes `no-listener`.
  - `readRecord` with a sidecar holding `null` → `sidecarError: 'unreadable'`; with no sidecar → `sidecar: null, sidecarError: null`.
  Run: `node --test tests/bin-lib/dev-server/record.test.js` — Expected: FAIL.
- [ ] **Step 2: Implement** `record.js`.
- [ ] **Step 3: Run** the Task 1 + Task 2 test files and the two source-scan suites — PASS.
- [ ] **Step 4: Commit** — `Add dev-server record reader/writer — txt line unchanged plus identity sidecar`.

---

### Task 3: Stop decision

**Role:** judgment
**Review risk:** high

**Files:**
- Create: `plugin/bin/lib/dev-server/stop.js`, `plugin/bin/lib/dev-server/index.js` (re-exports Tasks 1-3)
- Test: `tests/bin-lib/dev-server/stop.test.js`

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces:
  - `OUTCOMES = Object.freeze(['no-record', 'unparseable', 'foreign-worktree', 'stopped', 'already-stopped', 'survivor', 'unrelated-holder', 'stop-failed', 'identity-unreadable'])`
  - `identityMatches(recorded: { pid, startTime }, current) → boolean` — true only when `current.ok && current.alive && recorded.startTime !== null && current.startTime === recorded.startTime`.
  - `stopServer({ dir, worktree?: string, platform, runner, signal: (pid, sig) => void, sleep: (ms) => void, waitMs = 5000, identityMatches? }) → { outcome, legacy: boolean, reason: string|null, pid, port, holders: number[], signalled: boolean, recordKept: boolean, cleanupFailure: boolean, log: Array<{ status: 'AUTO'|'SKIP', text: string }> }` — `identityMatches` is injectable (defaults to the export) so the discrimination tests can substitute a check-skipping predicate.
- Decision rules (in order):
  1. No txt → `no-record`. Unparseable txt → `unparseable`, nothing touched, `recordKept: true`, `cleanupFailure: false`, one SKIP `condition: server record {dir}/ephemeral-server.txt unparseable ({reason}) → fallback: record and every process left alone, nothing signalled`.
  2. `worktree` given and ≠ the record's root → `foreign-worktree`, nothing touched, no log.
  3. Sidecar absent, unreadable, or naming a different `pid`/`port` than the txt line (reason `stale-sidecar`) → **legacy**: today's Section D behavior — POSIX `signal(pid, 'SIGTERM')` (ESRCH → already stopped), plus `signal(-pid, 'SIGTERM')` under `detached:yes` only; win32 `taskkill /PID {pid} /T /F` through `runner` (exit 128 = not found → already stopped; any other non-zero → `stop-failed`). Port held afterwards → `survivor`. One AUTO `identity unverified (legacy record): {reason}; stopped by pid {pid} alone`.
  4. Sidecar `leader.startTime === null` → `identity-unreadable`, nothing signalled, record kept, `cleanupFailure: true`.
  5. `readIdentity(leader.pid)` fails → `identity-unreadable` as in 4. Not alive or not `identityMatches` → leader not signalled. Matches → signal as in rule 3 (group kill keyed on the verified leader under `detached:yes`; never on `detached:no`); EPERM or a non-128 taskkill failure → `stop-failed`, record kept, `cleanupFailure: true`.
  6. Port check: when signalled, poll `findListeners(port)` every 250 ms until empty or `waitMs` elapsed; otherwise look once. Lookup failure → `identity-unreadable` (reason `listener-lookup-failed`), record kept.
     - No holder → `stopped` (signalled) or `already-stopped` (AUTO `already stopped: pid {pid}`); `deleteRecord`.
     - A holder is the server's **survivor** when `identityMatches(sidecar.listener, readIdentity(holder))` and `holder === listener.pid`, or (`detached:yes`, leader verified this call, `readIdentity(holder).pgid === leader.pid`). Any survivor → `survivor`, record kept, `cleanupFailure: true`, SKIP `condition: port {port} still held by the recorded server (pid {holder}) after stopping pid {pid} → fallback: server record kept; cleanup failure reported`.
     - No survivor, but the listener identity was not recorded (`listener === null`) and no group match applies, or a holder's identity is unreadable → `identity-unreadable`, record kept.
     - Otherwise → `unrelated-holder`, `holders`, `deleteRecord`, `cleanupFailure: false`, AUTO `port {port} held by unrelated pid {holder}; recorded server pid {pid} is gone, server record deleted`.
  `stop-failed` logs SKIP `condition: stopping pid {pid} failed ({reason}) → fallback: server record kept; cleanup failure reported`; `identity-unreadable` logs SKIP `condition: could not verify the server's identity ({reason}) → fallback: server record kept{, nothing signalled}; cleanup failure reported`.

- [ ] **Step 1: Failing tests** — a fake process table `{ [pid]: { startTime, pgid } }` and a fake port table `{ [port]: pid[] }` drive `runner`; `signal` removes the pid (and, for a negative pid, every pid in that group) from both tables and records the call; `sleep` is a no-op. The five spec scenarios, each a named test:
  - AC1.1 `reused pid: start time differs → not signalled, already stopped` (leader pid alive with a different start time, port free) → `signal` never called, `outcome: 'already-stopped'`, record deleted.
  - AC1.2 `matching leader is signalled` → `signal` called with `(leader, 'SIGTERM')`, `outcome: 'stopped'`.
  - AC1.3 `recorded listener survives a leader-only stop` (`detached:no`, listener 501 a separate process left in the port table) → `outcome: 'survivor'`, record kept.
  - AC1.4 `unrelated port holder` (leader start mismatch, port held by pid 900 not matching the listener identity, `detached:no`) → `outcome: 'unrelated-holder'`, `holders: [900]`, record deleted, log text includes `port 3001 held by unrelated pid 900`.
  - AC1.5 `detached:yes child in the leader's group counts as the survivor` (holder 502, `pgid` = leader, signal fake that ignores the group kill for 502) → `outcome: 'survivor'`.
  Plus: `detached:no never group-kills` (no negative-pid call); `win32 matching leader → taskkill /PID {pid} /T /F`; win32 exit 128 → `already-stopped`; EPERM → `stop-failed`; every Review Focus 1, 3, 4 case; legacy (no sidecar) keeps today's behavior and logs `identity unverified (legacy record)` exactly once; `unparseable` and `foreign-worktree` signal nothing.
  - AC2.1 **Discrimination:** one test runs each of the five scenarios again with `identityMatches: () => true` and asserts every scenario's own assertion now fails (collect `assert.throws` per scenario — each of the five must go red, not just one).
  Run: `node --test tests/bin-lib/dev-server/stop.test.js` — Expected: FAIL.
- [ ] **Step 2: Implement** `stop.js` and `index.js`; `stop.js`'s header carries the legacy-branch removal condition from Global Constraints.
- [ ] **Step 3: Run** Tasks 1-3 tests + source-scan suites — PASS.
- [ ] **Step 4: Commit** — `Add dev-server stop decision — verify leader and listener identity before signalling or blaming`.

---

### Task 4: `bin/dev-server.js` CLI

**Role:** integration

**Files:**
- Create: `plugin/bin/dev-server.js`
- Modify: `plugin/skills/_shared/auto-decision-log.md` (self-logging roster), `tests/phase-exit-call-sites-conformance.test.js` (`SELF_LOGGING_SOURCES`)
- Test: `tests/bin-lib/dev-server/cli.test.js`

**Interfaces:**
- Consumes: Tasks 1-3; `plugin/bin/lib/log-decision/append.js`'s `resolveTarget`, `formatEntry`, `appendEntries`.
- Produces: `run(argv: string[], deps) → exitCode`, `deps = { platform, runner, signal, sleep, now, cwd, mainRoot, stdout, stderr }`, all defaulted.
  - `dev-server.js record --run <dir> --pid <n> --port <n> --worktree <path> --detached yes|no` → prints one JSON line `{ txt, json, leader, listener, identityErrors }`; exit 0 written, 2 malformed invocation, 3 `--run` missing / not anchored under the main checkout (`resolveTarget`) or a write failed. A non-empty `identityErrors` also prints one stderr line naming them (still exit 0).
  - `dev-server.js stop --run <dir> --section <name> [--worktree <path>] [--wait-ms <n>]` → prints the `stopServer` envelope minus `log`, plus `logged: boolean` (true when every `log` entry was appended, or there were none); exit 0 for every outcome (status-as-data over the frozen `OUTCOMES` — state this in the header and `USAGE`), 2 malformed invocation, 3 `--run` missing / not anchored. Log entries go to `{--run}/decisions.md` under `--section` via `appendEntries`, `reversibility: 'n/a'`; a failed append → `logged: false` plus stderr `dev-server.js: could not append the decisions.md entry`.

- [ ] **Step 1: Failing tests** (call `run` with fakes; run dirs are real dirs under a `tests/helpers/git-fixtures.js` `gitRepo()` with `mainRoot` = that repo):
  - `--help` exits 0 with `USAGE` before any probe; unknown verb, missing `--run`, trailing bare `--pid`, `--pid ''`, `--pid 0`, `--port abc`, `--detached maybe`, `stop` without `--section`, a bare `constructor` token → exit 2.
  - `--run` outside the fixture repo, and a worktree-local shadow (`linkedWorktreeOf`) of the run dir → exit 3, shadow dir byte-unchanged.
  - `record` then `stop` round trip with a worktree root containing a space (Review Focus 5) → stop prints `outcome: 'stopped'`, both files gone.
  - `stop --worktree /other` → `foreign-worktree`, files untouched.
  - `stop` on a legacy record → `decisions.md` gains exactly one `identity unverified (legacy record)` line under the `--section` heading.
  - Append failure (make `decisions.md` a directory) → exit 0, `logged: false`, stderr line.
  Run: `node --test tests/bin-lib/dev-server/cli.test.js` — Expected: FAIL.
- [ ] **Step 2: Implement** `dev-server.js` per the quoted CLI wrapper contract; `require.main === module` sets `process.exitCode`.
- [ ] **Step 3: Roster** — in `auto-decision-log.md`'s "CLIs that log their own entries" paragraph, insert the sentence `` #3731's `dev-server.js stop` appends the same way. `` directly before `A skill never re-logs`; add `'dev-server.js stop': ['plugin/bin/dev-server.js']` to `SELF_LOGGING_SOURCES` (key order = order listed).
- [ ] **Step 4: Run** `node --test tests/bin-lib/dev-server/ tests/phase-exit-call-sites-conformance.test.js tests/bin-lib/exit-code-conformance.test.js tests/windows-hide-spawn-conformance.test.js tests/path-guard-conformance.test.js` — PASS.
- [ ] **Step 5: Commit** — `Add bin/dev-server.js record/stop CLI — self-logging, anchored --run`.

---

### Task 5: Live probe

**Role:** integration

**Files:**
- Test: `tests/bin-lib/dev-server/live-probe.test.js`

**Interfaces:**
- Consumes: the real `plugin/bin/dev-server.js` (spawned), Task 1 defaults.

- [ ] **Step 1: Write the test** (AC4.1) — skipped (`test.skip` with the reason) on win32 and when neither `lsof` nor `ss` resolves. Start a real detached shell leader: `spawn('/bin/sh', ['-c', `"${process.execPath}" "${serverScript}" ${port}; exit 0`], { detached: true, stdio: 'ignore' })` (Node's `detached: true` is `setsid()`; macOS ships no `setsid` binary — logged in this run's decisions.md), where `serverScript` listens on `port`; wait until the port answers. Spawn `dev-server.js record` (cwd = a `gitRepo()` fixture, `--run` inside it, `--detached yes`). Assert: sidecar `leader.pid === leader.pid`, `leader.startTime` equals `ps -o lstart= -p {leader}` under `LC_ALL=C TZ=UTC`, `listener.pid` equals `lsof -nP -iTCP:{port} -sTCP:LISTEN -t` (or the `ss` pid), `listener.pid !== leader.pid`, listener `pgid === leader.pid`. Then spawn `stop --section /test` → `outcome: 'stopped'`, the port no longer answers within 5 s, both record files gone. A second case writes a legacy txt line (no sidecar) for a fresh server and asserts `stop` still stops it and logs `identity unverified (legacy record)`. `after()` group-kills any leftover leader.
- [ ] **Step 2: Run** `node --test tests/bin-lib/dev-server/live-probe.test.js` — PASS on macOS; paste the output into the task report.
- [ ] **Step 3: Commit** — `Add dev-server live probe — real detached leader recorded and stopped through the helper`.

---

### Task 6: Record sites call the helper

**Role:** integration

**Files:**
- Modify: `plugin/skills/_shared/dev-url-detection.md` (Ephemeral server start item 4; Windows Ownership bullet)
- Modify: `plugin/skills/dispatch/task-prompt.md` (first template's Ephemeral dev server paragraph; second template's liveness paragraph restart rewrite)
- Modify: `tests/multispec-ephemeral-server-record-conformance.test.js` (re-point pins: AC3.1's `printf` / `> "{server-record}"` assertions; template paragraph needles)
- Modify: `tests/ephemeral-server-handoff-conformance.test.js` (re-point pins: the Windows Ownership bullet test's `taskkill /PID {pid} /T /F` needle)

**Interfaces:**
- Consumes: Task 4's `record` command line.

- [ ] **Step 1: Update the pins first** so they fail on today's text: AC3.1 asserts item 4 includes `` `node "${CLAUDE_PLUGIN_ROOT}/bin/dev-server.js" record --run `` and `--detached`, still includes the four server-record needles, and no longer contains `printf`; the Ownership-bullet test asserts `stopped as a tree, not a leader-only kill` and `dev-server.js stop` instead of the `taskkill` literal; a new assertion that each task-prompt template paragraph names `{plugin-root}/bin/dev-server.js" record` and keeps `{minted-run-dir}/ephemeral-server.txt`, `never a `spec-{N}/` subdirectory`, `Never delete `ephemeral-server.txt``, `end the recorded line with a trailing`. Run the two files — Expected: FAIL.
- [ ] **Step 2: Edit prose.** Item 4: replace the `printf` example with `node "${CLAUDE_PLUGIN_ROOT}/bin/dev-server.js" record --run "{server-record dir}" --pid "$PID" --port "$PORT" --worktree "$WORKTREE_ROOT" --detached {yes|no}`, saying it writes the same one-line record plus the `ephemeral-server.json` identity sidecar the stop verifies (leader and listener `(pid, start time)`), run once the readiness poll in item 3 succeeds; keep the "never the Edit/Write tool" reason and the liveness-handle sentences. Ownership bullet: the tree kill is `dev-server.js stop`'s win32 branch (Section D). task-prompt templates: replace each "plain Bash redirect (e.g. `printf …`)" with the `{plugin-root}` `record` call, byte-neutral (≤ +300 bytes for the file); the second template's restart rewrites the record through the same call.
- [ ] **Step 3: Run** `node --test tests/multispec-ephemeral-server-record-conformance.test.js tests/ephemeral-server-handoff-conformance.test.js tests/ephemeral-server-handoff-fixture.test.js tests/dispatch-prompt-bundle-citations.test.js tests/dev-url-detection-lease-conformance.test.js` and `node plugin/bin/plan-audit.js docs/superpowers/plans/2026-10-28-dev-server-identity.md --bytes` (headroom) — PASS.
- [ ] **Step 4: Commit** — `Route ephemeral-server record writes through dev-server.js record — identity sidecar at every start`.

---

### Task 7: Stop sites call the helper

**Role:** integration
**Review risk:** high

**Files:**
- Modify: `plugin/skills/wrap-up/cleanup-procedures-execution.md` (Section D steps 2-4)
- Modify: `plugin/skills/_shared/dev-url-detection.md` (### Cleanup standalone bullet)
- Modify: `plugin/skills/review/step3-routing.md` (Fix-wave server coordination item 1, item 3's "plain Bash redirect" clause)
- Modify: `plugin/skills/flow/multispec-review-console.md` (Shared teardown step 1)
- Modify: `plugin/skills/flow/multispec-parallel-waves.md` (merge-back stop bullet)
- Create: `tests/dev-server-stop-sites-conformance.test.js`
- Modify: `tests/ephemeral-server-handoff-conformance.test.js` (re-point pins: Section D tests at lines 59-156, 160-166, 179-184, 236-242, 271-281, 323-334)
- Modify: `tests/review-fix-ephemeral-server-conformance.test.js` (re-point pins: `assertRouting` needles `Never hand-roll a kill`, `plain Bash redirect`, the unparseable/port-held/stop-failure needles; the AC2.1 Section D needles)
- Modify: `tests/multispec-ephemeral-server-record-conformance.test.js` (re-point pins: AC2.1/AC2.2 `Section D steps 2-4` needles, Section D `2. Read the server record` line)

**Interfaces:**
- Consumes: Task 4's `stop` command line and its frozen `OUTCOMES`.

- [ ] **Step 1: New conformance test** (AC3.1) `tests/dev-server-stop-sites-conformance.test.js`: for each stop site (Section D body between `## D. Ephemeral dev server` and `## E. Issue claim release`; dev-url-detection `### Cleanup`; step3-routing `## Fix-wave server coordination (pipeline runs)`; multispec-review-console line starting `1. **Tear down the shared ephemeral dev server**`; multispec-parallel-waves bullet from `stop its dev server` to the next blank line) assert it contains `bin/dev-server.js" stop --run` and does **not** match `/\bkill \{pid\}|kill -- -\{pid\}|taskkill \/PID|lsof[^\n`]*\|\s*xargs kill/`. Go-red controls: re-inserting today's Section D POSIX bullet into the extracted body fails the no-restate predicate; deleting the helper call from each site fails the calls-helper predicate (one assertion per site). Run — Expected: FAIL.
- [ ] **Step 2: Edit prose.**
  - Section D: step 2 becomes one `node "${CLAUDE_PLUGIN_ROOT}/bin/dev-server.js" stop --run "{server-record dir}" --section "/wrap-up"` call (the server record's directory per item 4) and a routing table over its `outcome` — `stopped` / `already-stopped` / `unrelated-holder` / `no-record` / `foreign-worktree`: nothing more; `survivor` / `stop-failed` / `identity-unreadable`: report a cleanup failure naming the pid and port (the record is kept, the CLI logged the SKIP); `unparseable`: nothing (logged SKIP). Steps 3-4 collapse into what the CLI does (state the identity rule in one sentence: leader and listener `(pid, start time)`, the legacy branch and its removal condition). Keep the step-1 multi-spec defer check, the "only stops servers this pipeline started" and "no record → skip silently" paragraphs, and the phrase `read whatever it currently names`.
  - The other four sites: replace the restated stop (or the bare `Section D steps 2-4` reference) with the same `stop` call (`--section "/review"` / `"/flow"`; step3-routing passes `--worktree "{toplevel}"`, `{toplevel}` pasted from a separate `git rev-parse --show-toplevel` call (never a `$(...)` substitution — the worktree shell guard refuses it), and keeps its routing of `survivor`/`stop-failed`/`identity-unreadable` to "keep the record, log, note in Step 7, proceed — a degrade, never a block"), citing Section D for outcome handling. multispec-review-console net ≤ +300 bytes.
  - Update every pin listed in Files to the new wording; retire the Section D assertions whose behavior moved into `stop.js` (process-group, already-stopped, win32 tree kill, record gate, port-still-held, trailing-token parse) — each retired assertion's behavior must be covered by a Task 3 test; name the covering test in a one-line comment where the assertion was.
- [ ] **Step 3: Behavior-change prose sweep** — `git grep -n -e "Section D steps 2-4" -e "Section D's steps 2-4" -e "Never hand-roll a kill" -e "plain Bash redirect" -e "taskkill" -e "kill {pid}" -e "lsof -ti" -- plugin docs .claude/skills`; every hit is either updated here, in Task 8, or recorded as no-change with its reason in the task report (expected no-change: `plugin/bin/lib/verify/run.js`, `plugin/skills/journey-health/deep-tier.md`, `docs/journeys/run-a-deterministic-verification-check.md` — the verify runner's own timeout kill, unrelated).
- [ ] **Step 4: Run** `node --test tests/dev-server-stop-sites-conformance.test.js tests/ephemeral-server-handoff-conformance.test.js tests/review-fix-ephemeral-server-conformance.test.js tests/multispec-ephemeral-server-record-conformance.test.js` and the skill-audit rail suite `node --test tests/bin-lib/skill-audit/` — PASS.
- [ ] **Step 5: Commit** — `Route every ephemeral-server stop through dev-server.js stop — no inline kill at any stop site`.

---

### Task 8: Docs and journeys

**Role:** integration

**Files:**
- Modify: `docs/plugin-structure.md` (command reference line for `dev-server.js`, `plugin/bin/lib/dev-server/` module line)
- Modify: `docs/skill-graph.md` (## review `/wrap-up` row and `_shared/dev-url-detection.md` row: name `bin/dev-server.js stop`)
- Modify: `tests/review-fix-ephemeral-server-conformance.test.js` (the skill-graph test's `Section D steps 2-4` needle → `dev-server.js stop`)
- Modify: `docs/journeys/keep-a-multispec-runs-shared-server-tracked-3656.md`
- Modify: `docs/journeys/keep-review-fixes-from-rebuilding-under-the-live-server-3021.md`
- Modify: `docs/journeys/run-independent-records-in-parallel-waves-2677.md`

- [ ] **Step 1:** Add the CLI line beside `ports.js` in `docs/plugin-structure.md`'s command reference (verbs, flags, exit codes, outcome enum, `tests/bin-lib/dev-server/`) and a `plugin/bin/lib/dev-server/` module line beside `plugin/bin/lib/ports/`; update the skill-graph rows and their pin; replace each journey's "Section D steps 2-4" with the helper call.
- [ ] **Step 2: Run** `node --test tests/review-fix-ephemeral-server-conformance.test.js tests/docs-*.test.js` and the Task 7 sweep grep — PASS / no unexplained hits.
- [ ] **Step 3: Commit** — `Document bin/dev-server.js — plugin-structure, skill-graph, journeys`.

---

Waived AC5.1: `npm test` passing is proven by `/build` Common Step 5's full verification run, not a unit test.

## Self-review

- **Spec coverage:** Identity rule → Tasks 1-2; Kill side → Task 3 rules 3-5; Port side → Task 3 rule 6; One executable helper + every prose site → Tasks 4, 6, 7 (task-prompt.md added beyond the spec's list: it restates item 4's `printf` record write, and leaving it would make every dispatched run a legacy record); Legacy records + removal condition → Task 3 rule 3, Global Constraints, Section D. ACs: fake-process-table tests → Task 3 Step 1; go-red against an identity-skipping helper → Task 3's discrimination test; conformance test → Task 7 Step 1; live probe → Task 5; `npm test` → Common Step 5.
- **Interfaces:** `readIdentity`/`findListeners` (T1) → `recordServer`/`readRecord`/`deleteRecord` (T2) → `stopServer`/`identityMatches`/`OUTCOMES` (T3) → `run` (T4); names consistent across tasks.
- **Review Focus:** items 1, 3, 4 → Task 3; 2 → Task 1; 5 → Tasks 2 and 4.
