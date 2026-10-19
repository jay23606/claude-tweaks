'use strict';
// bin/lib/installed-plugins.js — pick which $CLAUDE_CONFIG_DIR/plugins/installed_plugins.json
// (default ~/.claude) entry of one plugin a session actually runs. readInstalledPlugins
// is the one reader of that file; both resolvers use it and share selectEntry, and both
// pass `{ excludeHome: true }`:
//   - bin/lib/impeccable-engine/index.js;
//   - the superpowers version resolver (#3380).
//
// Why excludeHome exists: a probe of real Claude Code sessions (#3380) showed
// that a project-scope install whose `projectPath` is the user's home directory
// is never applied to sessions under it, so a resolver reporting what a session
// really runs must skip it. Build-time probe for #3415 (2026-10-19, Claude Code
// 2.1.302, headless `claude -p` init events with hooks disabled): with a
// project-scope `impeccable@impeccable` 3.0.6 entry at the home directory and a
// user-scope 4.6.0, sessions in `~` and `~/Code Workspaces` both loaded the
// user-scope 4.6.0, so both resolvers now pass `excludeHome: true`. Observed, not
// encoded: `memenu-app` (its own 3.0.6 project entry, the `impeccable` marketplace
// declared in its `extraKnownMarketplaces`) also loaded user 4.6.0, while its
// superpowers 6.3.0 project entry did load — unexplained, so the resolver still
// matches such entries.

const path = require('path');
const { canonicalRealpath, isAncestorOrSelf } = require('./path-guard');

// Reads the installed-plugins file of the config dir the session runs under.
// deps: { readFile(p), homedir(), env? } — `env` is the caller's view of the
// environment (never process.env here); an absent `env` means no override.
// -> { ok: true, data, file } | { ok: false, file, detail }.
function readInstalledPlugins(deps) {
  const configDir = (deps.env && deps.env.CLAUDE_CONFIG_DIR) || path.join(deps.homedir(), '.claude');
  const file = path.join(configDir, 'plugins', 'installed_plugins.json');
  let text;
  try {
    text = deps.readFile(file);
  } catch (err) {
    return { ok: false, file, detail: err.code === 'ENOENT' ? `not found: ${file}` : err.message };
  }
  try {
    return { ok: true, data: JSON.parse(text), file };
  } catch (err) {
    return { ok: false, file, detail: `malformed JSON (${err.message})` };
  }
}

// The injected deps.realpath is passed through unchanged (both resolvers inject
// `fs.realpathSync.native`; the tests inject their own), and a failure falls back
// to the input so a stale projectPath still compares lexically.
function safeRealpath(p, deps) {
  if (!deps || typeof deps.realpath !== 'function') return p;
  const r = canonicalRealpath(p, { realpath: deps.realpath });
  return r === null ? p : r;
}

// Project-scope entries whose projectPath is an ancestor of (or equal to)
// `projectPath`, longest `projectPath` wins (first-encountered on a tie); falls
// back to the first user-scope entry; absent either, null. Non-object entries
// are skipped. deps: { realpath, homedir } — `homedir` is only read when
// `opts.excludeHome` is set, in which case a project entry whose realpathed
// `projectPath` is the realpathed home directory is skipped.
function selectEntry(entries, projectPath, deps, opts = {}) {
  const target = safeRealpath(projectPath, deps);
  const home = opts.excludeHome ? safeRealpath(deps.homedir(), deps) : null;
  let best = null;
  let bestLen = -1;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.scope !== 'project' || typeof entry.projectPath !== 'string') continue;
    const candidate = safeRealpath(entry.projectPath, deps);
    if (home !== null && candidate === home) continue;
    // One intended difference from the former inline test (#3417): that test
    // excluded any relative path starting with '..', so a child component named
    // like '..foo' was wrongly treated as outside the candidate. It now counts
    // as contained; only a whole '..' component is a parent escape.
    if (isAncestorOrSelf(candidate, target) && candidate.length > bestLen) {
      best = entry;
      bestLen = candidate.length;
    }
  }
  if (best) return best;
  return entries.find((e) => e && typeof e === 'object' && e.scope === 'user') || null;
}

module.exports = { readInstalledPlugins, selectEntry, safeRealpath };
