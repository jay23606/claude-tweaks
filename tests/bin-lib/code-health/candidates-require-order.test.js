'use strict';
// #2869 item 3: candidates-security-hardening.js and
// candidates-experiment-cleanup.js required `./candidates-dead-code` before
// `./focus-generators`, the reverse of the order `candidates-abstraction-
// police.js`'s own header comment documents as load-bearing: the registry
// (`focus-generators.js`) autoloads every vertical in a fixed order with
// `candidates-dead-code.js` first, so requiring the registry FIRST forces
// that cascade to finish before this module's own require of
// `candidates-dead-code` executes. Requiring `candidates-dead-code` first
// instead hands a sibling generator a still-mid-load, partially-populated
// exports object whenever the generator module is required directly (as its
// own test file does) rather than via the registry — binding helpers like
// `listTrackedFiles`/`listTrackedSourceFiles` to `undefined` and emitting a
// Node "inside circular dependency" warning for each access.
//
// Spawned in a fresh `node -e` child process per module (not a plain
// `require()` in this test's own process) so each assertion observes a
// genuinely fresh module cache, matching how the original report reproduced
// the warning (a standalone `node -e` invocation) and avoiding this test
// file's own require order polluting the result.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CODE_HEALTH_DIR = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'code-health');

function requireDirectStderr(moduleName) {
  const modPath = path.join(CODE_HEALTH_DIR, moduleName);
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(modPath)})`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return '';
  } catch (err) {
    // A generator module may throw on require outside its expected context
    // (e.g. missing fs state) — this test only cares about the circular-
    // dependency warning text, which Node writes to stderr regardless of
    // exit code, so inspect stderr either way.
    return (err.stderr || '').toString();
  }
}

// Every module in this family EXCEPT candidates-dead-code.js itself: that
// module is the one the registry's own fixed autoload order always loads
// FIRST, so requiring it directly always re-enters the registry's load of
// itself (dead-code -> focus-generators -> dead-code, still mid-load) — a
// structurally different condition from the require-ORDER bug this record
// fixes in a *consuming* module, and not fixable by reordering requires
// inside dead-code.js itself (the two files are mutually referential by
// construction: dead-code.js registers itself with the registry, and the
// registry's fixed order loads dead-code.js first). Out of scope here —
// tracked separately if it ever needs fixing, not silently ignored: the
// module is omitted from this test's positive list rather than asserted to
// print 0, and that omission is explained in this comment.
const MODULES_REQUIRING_NO_CIRCULAR_WARNING = [
  'candidates-abstraction-police.js',
  'candidates-agent-trust-scope.js',
  'candidates-app-store-readiness.js',
  'candidates-experiment-cleanup.js',
  'candidates-prelaunch.js',
  'candidates-security-hardening.js',
  'candidates-test-hygiene.js',
];

for (const moduleName of MODULES_REQUIRING_NO_CIRCULAR_WARNING) {
  test(`#2869: requiring ${moduleName} directly in a fresh node process emits no "inside circular dependency" warning`, () => {
    const stderr = requireDirectStderr(moduleName);
    assert.ok(
      !/circular dependency/i.test(stderr),
      `${moduleName} emitted a circular-dependency warning on direct require:\n${stderr}`,
    );
  });
}

test('#2869: candidates-dead-code.js is the one module deliberately excluded above, and this test documents why rather than silently skipping it', () => {
  // This is a narrative pin, not a behavior assertion: candidates-dead-code.js
  // is first in focus-generators.js's own fixed autoload order, so a direct
  // require of it is expected to still warn (a structurally different,
  // pre-existing condition — see the comment above the module list).
  assert.ok(
    !MODULES_REQUIRING_NO_CIRCULAR_WARNING.includes('candidates-dead-code.js'),
    'candidates-dead-code.js must stay excluded from the positive-assertion list — see the comment above',
  );
});
