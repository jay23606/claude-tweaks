'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// refs #2908 — candidates-security-hardening.js must require
// ('./focus-generators') before require('./candidates-dead-code')
// (.claude/skills/code-health-focus-vertical/SKILL.md pitfall 1). Reversing
// the order emits Node's "inside circular dependency" warning on stderr
// (listTrackedSourceFiles, isGlobDiscoveredTestFile, extractModuleExports,
// escapeRegExp bound to undefined in that process) — #2628 fixed this exact
// shape in candidates-app-store-readiness.js. The first two tests are scoped to
// this one generator (candidates-experiment-cleanup.js had the same reversed
// order and was fixed separately in #3330). The last two (refs #2869) cover
// every module: the registry autoloads candidates-dead-code.js first, so
// dead-code must publish its exports before it requires the registry back, or
// all of its siblings load against an empty exports object. A new
// candidates-*.js file is picked up by the discovery in the third test.

const CODE_HEALTH_DIR = path.join(__dirname, '../../../plugin/bin/lib/code-health');
const MODULE_PATH = path.join(CODE_HEALTH_DIR, 'candidates-security-hardening.js');

test('candidates-security-hardening.js loads in a fresh process with no circular-dependency warning', () => {
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(MODULE_PATH)})`], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `load exited non-zero: ${result.stderr}`);
  assert.ok(
    !/inside circular dependency/i.test(result.stderr || ''),
    `candidates-security-hardening.js emitted a circular-dependency warning on load:\n${result.stderr}`
  );
});

test('candidates-security-hardening.js requires ./focus-generators before ./candidates-dead-code', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const focusGeneratorsIdx = source.indexOf("require('./focus-generators')");
  const deadCodeIdx = source.indexOf("require('./candidates-dead-code')");
  assert.ok(focusGeneratorsIdx !== -1, "expected a require('./focus-generators') line");
  assert.ok(deadCodeIdx !== -1, "expected a require('./candidates-dead-code') line");
  assert.ok(
    focusGeneratorsIdx < deadCodeIdx,
    "candidates-security-hardening.js must require './focus-generators' before './candidates-dead-code' — reverting this order regresses #2908 (verified by temporarily reverting it: the test above fails with the circular-dependency warning)"
  );
});

test('every candidates-*.js module and focus-generators.js loads in a fresh process with no circular-dependency warning', () => {
  const modules = fs
    .readdirSync(CODE_HEALTH_DIR)
    .filter((name) => /^candidates-.*\.js$/.test(name) || name === 'focus-generators.js');
  assert.ok(modules.includes('candidates-dead-code.js'), 'discovery must include candidates-dead-code.js');
  assert.ok(modules.length >= 9, `expected >= 9 modules, discovered ${modules.length}: ${modules.join(', ')}`);

  const offenders = [];
  for (const name of modules) {
    const modulePath = path.join(CODE_HEALTH_DIR, name);
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(modulePath)})`], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${name} load exited non-zero: ${result.stderr}`);
    if (/inside circular dependency/i.test(result.stderr || '')) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `modules that emit a circular-dependency warning on load: ${offenders.join(', ')}`);
});

test('dead-code stays registered under both load orders', () => {
  const deadCodePath = path.join(CODE_HEALTH_DIR, 'candidates-dead-code.js');
  const registryPath = path.join(CODE_HEALTH_DIR, 'focus-generators.js');
  const printRegistration = `console.log(typeof require(${JSON.stringify(registryPath)}).FOCUS_GENERATORS['dead-code'])`;

  // Order A: dead-code first, then the registry.
  const deadCodeFirst = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(deadCodePath)}); ${printRegistration}`],
    { encoding: 'utf8' }
  );
  // Order B: the registry only (it autoloads dead-code itself).
  const registryOnly = spawnSync(process.execPath, ['-e', printRegistration], { encoding: 'utf8' });

  assert.equal(deadCodeFirst.stdout.trim(), 'function', `dead-code first: ${deadCodeFirst.stderr}`);
  assert.equal(registryOnly.stdout.trim(), 'function', `registry only: ${registryOnly.stderr}`);
});
