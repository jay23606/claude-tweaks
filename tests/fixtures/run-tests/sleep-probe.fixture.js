// Not a `*.test.js` on purpose (see tmpdir-probe.fixture.js). tests/run-tests-isolation.test.js
// copies it in as `sleep.test.js`: it writes `process.env.CT_PROBE_OUT` once started, then sleeps
// long enough that a runner which waits for it to finish would be caught (#3969).
'use strict';
const { test } = require('node:test');
const fs = require('fs');

test('signals it started, then sleeps', async () => {
  fs.writeFileSync(process.env.CT_PROBE_OUT, 'started');
  await new Promise((resolve) => setTimeout(resolve, 10000));
});
