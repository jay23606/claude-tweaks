'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { selectEntry, readInstalledPlugins } = require('../../plugin/bin/lib/installed-plugins');

// #3380: selectEntry moved out of impeccable-engine so the superpowers version
// resolver can share it. These tests pin the rule Impeccable already relied on
// (the first six and the default-off half of the excludeHome test) plus the
// opt-in home exclusion the superpowers resolver adds.

function tmpRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'installed-plugins-test-')));
}

function mkdirs(...dirs) {
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
}

const user = { scope: 'user', installPath: '/u' };
const project = (projectPath) => ({ scope: 'project', projectPath, installPath: `/p${projectPath}` });

function depsFor(home) {
  return { realpath: fs.realpathSync, homedir: () => home };
}

test('selectEntry: an ancestor-or-self project entry wins over the user entry', () => {
  const root = tmpRoot();
  const proj = path.join(root, 'proj');
  mkdirs(path.join(proj, 'a', 'b'));
  const entry = project(proj);
  assert.equal(selectEntry([user, entry], path.join(proj, 'a', 'b'), depsFor(root)), entry);
});

test('selectEntry: the longest projectPath wins', () => {
  const root = tmpRoot();
  const proj = path.join(root, 'proj');
  mkdirs(path.join(proj, 'x'));
  const outer = project(root);
  const inner = project(proj);
  assert.equal(selectEntry([outer, inner], path.join(proj, 'x'), depsFor('/nowhere')), inner);
  assert.equal(selectEntry([inner, outer], path.join(proj, 'x'), depsFor('/nowhere')), inner);
});

test('selectEntry: equal-length candidates keep the first-encountered entry', () => {
  const root = tmpRoot();
  mkdirs(path.join(root, 'proj'));
  const first = project(path.join(root, 'proj'));
  const second = project(path.join(root, 'proj'));
  assert.equal(selectEntry([first, second], path.join(root, 'proj'), depsFor('/nowhere')), first);
});

test('selectEntry: a sibling sharing a name prefix does not match', () => {
  const root = tmpRoot();
  mkdirs(path.join(root, 'proj'), path.join(root, 'proj2'));
  assert.equal(selectEntry([user, project(path.join(root, 'proj'))], path.join(root, 'proj2'), depsFor('/nowhere')), user);
});

test('selectEntry: a symlinked target matches its real project', () => {
  const root = tmpRoot();
  const proj = path.join(root, 'proj');
  mkdirs(path.join(proj, 'sub'));
  fs.symlinkSync(proj, path.join(root, 'link'));
  const entry = project(proj);
  assert.equal(selectEntry([user, entry], path.join(root, 'link', 'sub'), depsFor('/nowhere')), entry);
});

test('selectEntry: a symlinked projectPath matches the real target', () => {
  const root = tmpRoot();
  const proj = path.join(root, 'proj');
  mkdirs(path.join(proj, 'sub'));
  fs.symlinkSync(proj, path.join(root, 'link'));
  const entry = project(path.join(root, 'link'));
  assert.equal(selectEntry([user, entry], path.join(proj, 'sub'), depsFor('/nowhere')), entry);
});

test('selectEntry: no match and no user entry returns null', () => {
  const root = tmpRoot();
  mkdirs(path.join(root, 'proj'), path.join(root, 'other'));
  assert.equal(selectEntry([project(path.join(root, 'proj'))], path.join(root, 'other'), depsFor('/nowhere')), null);
  assert.equal(selectEntry([], path.join(root, 'other'), depsFor('/nowhere')), null);
});

test('selectEntry: local and managed scopes are ignored', () => {
  const root = tmpRoot();
  const proj = path.join(root, 'proj');
  mkdirs(proj);
  const local = { scope: 'local', projectPath: proj, installPath: '/l' };
  const managed = { scope: 'managed', projectPath: proj, installPath: '/m' };
  assert.equal(selectEntry([local, managed, user], proj, depsFor('/nowhere')), user);
});

test('selectEntry: excludeHome skips a home-directory project entry (default keeps it)', () => {
  const home = tmpRoot();
  mkdirs(path.join(home, 'work'));
  const homeEntry = project(home);
  const entries = [homeEntry, user];
  const target = path.join(home, 'work');
  assert.equal(selectEntry(entries, target, depsFor(home), { excludeHome: true }), user);
  assert.equal(selectEntry(entries, target, depsFor(home)), homeEntry);
});

test('selectEntry: excludeHome matches home through a symlink and still keeps a deeper project entry', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  const proj = path.join(home, 'proj');
  mkdirs(proj);
  fs.symlinkSync(home, path.join(root, 'homelink'));
  const deeper = project(proj);
  const homeLinkEntry = project(path.join(root, 'homelink'));
  assert.equal(selectEntry([homeLinkEntry, deeper, user], proj, depsFor(home), { excludeHome: true }), deeper);
  assert.equal(selectEntry([homeLinkEntry, user], proj, depsFor(home), { excludeHome: true }), user);
});

test('selectEntry: excludeHome realpaths a symlinked homedir() too', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  mkdirs(path.join(home, 'work'));
  fs.symlinkSync(home, path.join(root, 'homelink'));
  const entries = [project(home), user];
  assert.equal(selectEntry(entries, path.join(home, 'work'), depsFor(path.join(root, 'homelink')), { excludeHome: true }), user);
});

test('selectEntry: non-object entries are skipped', () => {
  const root = tmpRoot();
  mkdirs(path.join(root, 'proj'));
  assert.equal(selectEntry([null, 'x', user], path.join(root, 'proj'), depsFor('/nowhere')), user);
});

function readerDeps(home, env) {
  return { readFile: (p) => fs.readFileSync(p, 'utf8'), homedir: () => home, env };
}

test('readInstalledPlugins: CLAUDE_CONFIG_DIR wins over {home}/.claude', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  const cfg = path.join(root, 'cfg');
  const homeFile = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  const cfgFile = path.join(cfg, 'plugins', 'installed_plugins.json');
  mkdirs(path.dirname(homeFile), path.dirname(cfgFile));
  fs.writeFileSync(homeFile, JSON.stringify({ plugins: { home: true } }));
  fs.writeFileSync(cfgFile, JSON.stringify({ plugins: { cfg: true } }));
  const r = readInstalledPlugins(readerDeps(home, { CLAUDE_CONFIG_DIR: cfg }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { plugins: { cfg: true } });
  assert.equal(r.file, cfgFile);
});

test('readInstalledPlugins: env without CLAUDE_CONFIG_DIR, an empty CLAUDE_CONFIG_DIR, and an absent deps.env all read {home}/.claude', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  const homeFile = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  mkdirs(path.dirname(homeFile));
  fs.writeFileSync(homeFile, JSON.stringify({ plugins: { home: true } }));
  for (const env of [{}, { CLAUDE_CONFIG_DIR: '' }]) {
    const r = readInstalledPlugins(readerDeps(home, env));
    assert.deepEqual(r.data, { plugins: { home: true } }, JSON.stringify(env));
    assert.equal(r.file, homeFile);
  }
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = path.join(root, 'nonexistent');
  try {
    const r = readInstalledPlugins({ readFile: (p) => fs.readFileSync(p, 'utf8'), homedir: () => home });
    assert.deepEqual(r.data, { plugins: { home: true } });
    assert.equal(r.file, homeFile);
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('readInstalledPlugins: a CLAUDE_CONFIG_DIR with no plugins file does not fall back to home', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  const cfg = path.join(root, 'cfg');
  const homeFile = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  const file = path.join(cfg, 'plugins', 'installed_plugins.json');
  mkdirs(path.dirname(homeFile), cfg);
  fs.writeFileSync(homeFile, JSON.stringify({ plugins: {} }));
  const r = readInstalledPlugins(readerDeps(home, { CLAUDE_CONFIG_DIR: cfg }));
  assert.equal(r.ok, false);
  assert.equal(r.detail, `not found: ${file}`);
  assert.equal(r.file, file);
});

test('readInstalledPlugins: malformed JSON -> malformed JSON (...) detail', () => {
  const root = tmpRoot();
  const home = path.join(root, 'home');
  const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  mkdirs(path.dirname(file));
  fs.writeFileSync(file, '{nope');
  const r = readInstalledPlugins(readerDeps(home, {}));
  assert.equal(r.ok, false);
  assert.match(r.detail, /^malformed JSON \(/);
  assert.equal(r.file, file);
});

test('readInstalledPlugins: a non-ENOENT read error passes its message through', () => {
  const r = readInstalledPlugins({
    readFile: () => {
      throw Object.assign(new Error('EACCES: denied'), { code: 'EACCES' });
    },
    homedir: () => '/nowhere',
    env: {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.detail, 'EACCES: denied');
  assert.match(r.file, /installed_plugins\.json$/);
});
