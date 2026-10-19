# One installed_plugins.json Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both `installed_plugins.json` resolvers (Impeccable engine, superpowers version) read the file through one shared reader that honors `CLAUDE_CONFIG_DIR`; Impeccable also canonicalizes case via the native realpath and skips a home-directory project entry.

**Architecture:** Add `readInstalledPlugins(deps)` to `plugin/bin/lib/installed-plugins.js` (the module that already owns `selectEntry`). Each resolver maps its `{ok:false, detail}` onto its own failure contract: Impeccable → `{ok:false, reason:'not-installed', fix, detail}`, superpowers → `null`.

**Tech Stack:** Node 18+, `node --test`, no dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T035127-record-3415/work/3415-spec.md` (record #3415)

Scope keywords: readInstalledPlugins, excludeHome

## Global Constraints

- The config dir is `env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude')`; the file is `{configDir}/plugins/installed_plugins.json`.
- A missing `deps.env` means no override. The shared reader never reads `process.env`; only each resolver's `defaultDeps()` supplies `env: process.env`.
- `FAILURE_REASONS` in `plugin/bin/lib/impeccable-engine/index.js` stays byte-identical.
- Impeccable keeps its three `detail` forms: `not found: {file}`, `malformed JSON ({message})`, and the read error's own `message`.
- `superpowers-version.js` keeps returning `null` on any failure; its existing tests and `tests/hooks-session-start.test.js` pass unchanged.
- `git grep -n "'installed_plugins.json'" -- plugin/bin` returns exactly one hit, in `plugin/bin/lib/installed-plugins.js`.
- Build-time probe result (recorded in `decisions.md`, 2026-10-19, Claude Code 2.1.302, headless `claude -p` init events with hooks disabled): with a project-scope `impeccable@impeccable` 3.0.6 entry at the home directory and a user-scope 4.6.0, sessions in `~` and `~/Code Workspaces` both loaded the user-scope 4.6.0. Decision: Impeccable's `resolve()` passes `{ excludeHome: true }`. Observed, not encoded: `memenu-app` (its own 3.0.6 project entry, `impeccable` marketplace declared in its `extraKnownMarketplaces`) also loaded user 4.6.0, while its superpowers 6.3.0 project entry did load.

## Review Focus

- `CLAUDE_CONFIG_DIR` set to an empty string — must fall back to `{home}/.claude` (same `||` rule as `dream-scan.js`). Pinned in Task 1.
- `CLAUDE_CONFIG_DIR` set but its plugins file absent while `{home}/.claude` has one — must NOT fall back to home (superpowers' existing test pins this; Task 1 pins it for the shared reader).
- A test process that has `CLAUDE_CONFIG_DIR` set in its own environment while `deps.env` is absent — must read `{home}/.claude`. Pinned in Task 1 and Task 2 by setting `process.env.CLAUDE_CONFIG_DIR` to a bogus dir inside the test and restoring it in `finally`.
- A read error other than ENOENT (EACCES, EISDIR) — Impeccable's `detail` is the error's message, not `not found:`. Pinned in Task 1.
- A home-directory project entry when the session is in a deeper project with its own entry — the deeper entry still wins (already pinned by `installed-plugins.test.js`'s symlink/excludeHome tests; no new test).

---

### Task 1: Shared reader in installed-plugins.js

**Files:**
- Modify: `plugin/bin/lib/installed-plugins.js`
- Test: `tests/bin-lib/installed-plugins.test.js`

**Interfaces:**
- Produces: `readInstalledPlugins(deps: { readFile(p): string, homedir(): string, env?: object }) -> { ok: true, data: any, file: string } | { ok: false, file: string, detail: string }`, exported alongside `selectEntry`, `safeRealpath`.

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/installed-plugins.test.js` (import `readInstalledPlugins`; build files under `tmpRoot()`; `deps = { readFile: (p) => fs.readFileSync(p, 'utf8'), homedir: () => home, env }`):
  - `readInstalledPlugins: CLAUDE_CONFIG_DIR wins over {home}/.claude` — both dirs hold a file with different `plugins` content; `env: { CLAUDE_CONFIG_DIR: cfg }` → `ok === true`, `data` equals the cfg file's object, `file === path.join(cfg, 'plugins', 'installed_plugins.json')`.
  - `readInstalledPlugins: env without CLAUDE_CONFIG_DIR, an empty CLAUDE_CONFIG_DIR, and an absent deps.env all read {home}/.claude` — three calls (`env: {}`, `env: { CLAUDE_CONFIG_DIR: '' }`, no `env` key) each return home's data; the absent-env call runs with `process.env.CLAUDE_CONFIG_DIR` set to a nonexistent dir, restored in `finally`.
  - `readInstalledPlugins: a CLAUDE_CONFIG_DIR with no plugins file does not fall back to home` — `ok === false`, `detail === \`not found: ${file}\``, `file` under the override dir.
  - `readInstalledPlugins: malformed JSON -> malformed JSON (...) detail` — file contains `{nope`; `detail` matches `/^malformed JSON \(/`.
  - `readInstalledPlugins: a non-ENOENT read error passes its message through` — `readFile: () => { throw Object.assign(new Error('EACCES: denied'), { code: 'EACCES' }); }` → `detail === 'EACCES: denied'`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/installed-plugins.test.js`
Expected: FAIL — `readInstalledPlugins is not a function`.

- [ ] **Step 3: Implement `readInstalledPlugins(deps)` in `plugin/bin/lib/installed-plugins.js`**

Path from the Global Constraints rule (`(deps.env && deps.env.CLAUDE_CONFIG_DIR) || path.join(deps.homedir(), '.claude')`); one `deps.readFile(file)` in try/catch — `err.code === 'ENOENT'` → `not found: ${file}`, otherwise `err.message`; `JSON.parse` in try/catch → `malformed JSON (${err.message})`. Every return carries `file`. Also update the header comment: line 2's `~/.claude/plugins/installed_plugins.json` becomes `$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json (default ~/.claude)`, name `readInstalledPlugins` as the one reader both resolvers use, and replace the "Impeccable keeps today's rule (the option defaults off) — changing it there is a separate decision." sentence with the probe result and decision from Global Constraints (both resolvers now pass `excludeHome: true`; include the observed-not-encoded memenu-app note). Update the `safeRealpath` comment so it no longer says impeccable-engine injects the JS form.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/installed-plugins.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/installed-plugins.js tests/bin-lib/installed-plugins.test.js
git commit -m "Add the shared installed_plugins.json reader — honors CLAUDE_CONFIG_DIR (refs #3415)"
```

### Task 2: Impeccable resolver uses the shared reader, native realpath, excludeHome

**Files:**
- Modify: `plugin/bin/lib/impeccable-engine/index.js` (delete local `readInstalledPlugins` at :108-122; `defaultDeps()` at :54-71; `resolve()` at :171-178)
- Modify: `tests/path-guard-conformance.test.js:136` (the `lib/impeccable-engine/index.js` ALLOWLIST `reason` text only — counts stay `realpathSync: 1, existsSync: 1`)
- Test: `tests/bin-lib/impeccable-engine/resolve.test.js`

**Interfaces:**
- Consumes: `readInstalledPlugins(deps)` and `selectEntry(entries, projectPath, deps, { excludeHome: true })` from `../installed-plugins`.
- Produces: `defaultDeps()` gains `env: process.env`; its `realpath` becomes `fs.realpathSync.native`. `resolve()`'s return shapes are unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/bin-lib/impeccable-engine/resolve.test.js` (real temp dirs built from `fs.realpathSync(fs.mkdtempSync(...))`, removed in `finally`; `spawn: () => 'impeccable-engine 0.1.11\n'`, `exists: () => true` unless stated):
  - `AC1.1/AC1.2: deps.env.CLAUDE_CONFIG_DIR points at a config dir holding an impeccable user entry; homedir() has no plugins file -> resolve() selects it` — real `readFile`, `env: { CLAUDE_CONFIG_DIR: cfg }`, `homedir: () => emptyHome` → `out.ok === true`, `out.pluginRoot === '/fake/cfg/install'`.
  - `AC2.1/AC2.2: deps.env omitted and homedir() holds the plugins file -> resolve() finds the entry, even with CLAUDE_CONFIG_DIR set in process.env` — set `process.env.CLAUDE_CONFIG_DIR` to a nonexistent dir, restore in `finally`; deps object has no `env` key → `out.ok === true`.
  - `AC3.1/AC3.2: a mis-cased projectPath resolves the project-scope entry through defaultDeps().realpath` — `root` realpathed temp dir with `proj` subdir; `misCased = proj.toUpperCase()`; if `misCased === proj` or `!fs.existsSync(misCased)` → `t.skip('volume is case-sensitive: mis-cased path does not exist')`. Entries: project at `proj` (installPath `/p`), user (installPath `/u`); deps `{ ...fakeDeps({ entries }), realpath: defaultDeps().realpath }`; `resolve({ projectPath: misCased }, deps)` → `pluginRoot === '/p'`.
  - `AC6.1: a home-directory project entry is skipped (excludeHome) -> the user entry wins` — `fakeDeps` (homedir `/fake-home`) with entries `[{ scope:'project', projectPath:'/fake-home', installPath:'/path/home', ... }, { scope:'user', installPath:'/path/user', ... }]`; `resolve({ projectPath: '/fake-home/work' }, deps)` → `pluginRoot === '/path/user'`.
  - `defaultDeps() injects the native realpath and process.env` — `defaultDeps().realpath === fs.realpathSync.native`, `defaultDeps().env === process.env`.
  - Change the existing `installed_plugins.json missing entirely` test: absence is now `readFile` throwing `Object.assign(new Error('ENOENT'), { code: 'ENOENT' })` (keep `exists: () => true`); assert `reason === 'not-installed'` and `out.detail.startsWith('not found: ')`.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/bin-lib/impeccable-engine/resolve.test.js`
Expected: FAIL — AC1 (reads `/fake/home`-relative path, not-installed), AC3 (JS realpath echoes casing; user entry chosen; FAILS on a case-insensitive volume), AC6 (home entry chosen), the defaultDeps test, and the missing-file test (readFile throws uncaught → `detail` is the raw message, not `not found:`).

- [ ] **Step 3: Implement in `plugin/bin/lib/impeccable-engine/index.js`**

Import `readInstalledPlugins` with `selectEntry`; delete the local function; `resolve()` keeps `if (!read.ok) return { ok:false, reason:'not-installed', fix: NOT_INSTALLED_FIX, detail: read.detail }` and calls `selectEntry(entries, projectPath, deps, { excludeHome: true })`; `defaultDeps()` gets `realpath: fs.realpathSync.native` and `env: process.env`. Update the resolve() deps comment (`{ readFile, exists, realpath, homedir, env, cwd, spawn }`). In `tests/path-guard-conformance.test.js:136`, rewrite the reason: `exists` backs only the launcher presence check (the plugins-file read now goes through installed-plugins.readInstalledPlugins, which reports ENOENT itself), and `realpath` is `fs.realpathSync.native`, matching superpowers-version.js, so a mis-cased cwd still matches its project entry.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/bin-lib/impeccable-engine/resolve.test.js tests/bin-lib/impeccable-engine/run.test.js tests/bin-lib/impeccable-engine/windows-launch.test.js tests/path-guard-conformance.test.js tests/impeccable-engine-skip-reasons.test.js`
Expected: PASS, all.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/impeccable-engine/index.js tests/bin-lib/impeccable-engine/resolve.test.js tests/path-guard-conformance.test.js
git commit -m "Route Impeccable's resolver through the shared reader — CLAUDE_CONFIG_DIR, native realpath, excludeHome (refs #3415)"
```

### Task 3: superpowers resolver uses the shared reader; docs

**Files:**
- Modify: `plugin/bin/lib/superpowers-version.js:79-81` (and its require on line 34; replace the three lines with exactly three lines so the `:69`/`:123`/`:124` line refs in `tests/path-guard-conformance.test.js:150` stay true)
- Modify: `docs/plugin-structure.md:65-66`
- Modify: `plugin/skills/design-wrapper/modes/explore.md:38`
- Check, no edit expected (scope-keyword sweep hits): `docs/incident-log.md` (historical narrative of #3380's probe), `tests/bin-lib/path-guard/callers-characterization.test.js` (pins `selectEntry`'s `excludeHome` option, whose behavior this plan does not change — it must keep passing in Step 2's `npm test`)

**Interfaces:**
- Consumes: `readInstalledPlugins(deps)` from `./installed-plugins`.

- [ ] **Step 1: Replace the inline path build and read** — import `readInstalledPlugins` with `selectEntry, safeRealpath`; lines 79-81 become `const read = readInstalledPlugins(deps);` / `if (!read.ok) return null;` / `const parsed = read.data;`.

- [ ] **Step 2: Verify unchanged suites and the grep AC**

Run: `node --test tests/bin-lib/superpowers-version.test.js tests/hooks-session-start.test.js tests/path-guard-conformance.test.js`
Expected: PASS, no test file edited (AC4.1).

Run: `git grep -n "'installed_plugins.json'" -- plugin/bin`
Expected: exactly one line, in `plugin/bin/lib/installed-plugins.js` (AC5.1).

- [ ] **Step 3: Docs** — `docs/plugin-structure.md:65`: replace `` via `~/.claude/plugins/installed_plugins.json` `` with `` via `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` (default `~/.claude`), read through installed-plugins.js's shared reader ``, and add after "else the user-scope entry" that a home-directory project entry is skipped (`excludeHome`). `:66`: add `readInstalledPlugins` (the one reader of `$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json`, default `~/.claude`) and state both resolvers pass `excludeHome` (probe-confirmed for each, #3380 and #3415). `explore.md:38`: `` `~/.claude/plugins/installed_plugins.json` `` becomes `` `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` (default `~/.claude`) ``.

- [ ] **Step 4: Full suite (AC7.1)**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/a292f060-8366-4275-954a-331f5cb4ebab/scratchpad/npm-test-task3.txt 2>&1; echo exit=$?`
Expected: `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/superpowers-version.js docs/plugin-structure.md plugin/skills/design-wrapper/modes/explore.md
git commit -m "Use the shared reader in superpowers-version and document the config-dir location (refs #3415)"
```
