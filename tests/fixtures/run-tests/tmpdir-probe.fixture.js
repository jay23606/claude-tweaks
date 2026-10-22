// Not a `*.test.js` on purpose: the real suite must never collect this. The process-level tests in
// tests/run-tests-isolation.test.js copy it into a fresh temp root as `probe.test.js` and run
// tools/run-tests.js over that root, then read back what the runner gave this test (#3969).
'use strict';
const { test } = require('node:test');
const fs = require('fs');
const os = require('os');

test('records the TMPDIR and slot flag run-tests.js gave this suite', () => {
  fs.writeFileSync(
    process.env.CT_PROBE_OUT,
    JSON.stringify({ tmpdir: os.tmpdir(), held: process.env.CT_TEST_SUITE_SLOT_HELD }),
  );
});
