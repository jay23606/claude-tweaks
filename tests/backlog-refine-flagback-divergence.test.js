'use strict';

// #3324: a flag-back row dropped for a gained auto:build must log whether that concurrent
// grant agreed with this run's own RECOMMEND_BUILD verdict, the same way the #2719 grant-row
// comparison does. Each assertion is paired with a go-red probe against the pre-change text
// it replaces [IL-105].
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { computeClosingTally } = require('../plugin/bin/lib/closing-tally/closing-tally');

const DIR = path.join(__dirname, '..', 'plugin', 'skills', 'backlog');
const refineMode = fs.readFileSync(path.join(DIR, 'refine-mode.md'), 'utf8');
const closing = fs.readFileSync(path.join(DIR, 'refine-closing-summary.md'), 'utf8');

// Pre-change sentences this record rewrites — used only as go-red probes.
const PRE_REVERIFY = "A grant row dropped for a gained grant logs whether that concurrent grant agreed with this run's own verdict — `refine-closing-summary.md`'s Concurrent-grant comparison (#2719). Flag-back reverify checks labels only";
const PRE_TEMPLATES = 'AUTO {time} — Backlog refine: skipped #{n} — premise changed since confirmation ({what changed}); dropped without writing.\n'
  + 'AUTO {time} — Backlog refine: skipped #{n} — premise changed since confirmation (concurrent grant agreed: live {live grant}, this run RECOMMEND_MERGE={true|false}); dropped without writing.\n'
  + 'AUTO {time} — Backlog refine: skipped #{n} — premise changed since confirmation (concurrent grant DIVERGED: live {live grant}, this run discarded RECOMMEND_MERGE={true|false} — {grant-check RATIONALE}); dropped without writing.\n'
  + 'FAILED {time}';

function pinned(text, pattern, pre, message) {
  assert.match(text, pattern, message);
  assert.doesNotMatch(pre, pattern, 'pattern must not match the pre-change text (proves it can go red)');
}

test('AC1.1: refine-mode.md routes a flag-back row that gained auto:build to the flag-back comparison', () => {
  pinned(refineMode, /A flag-back row dropped for a gained `auto:build` logs the same comparison against its own `RECOMMEND_BUILD` verdict — `refine-closing-summary\.md`'s Flag-back concurrent-grant comparison \(#3324\)/, PRE_REVERIFY,
    'refine-mode.md Step 5 must route a flag-back row that gained auto:build to the flag-back comparison');
});

test('AC1.1: closing summary carries distinguishable flag-back agreed and DIVERGED templates', () => {
  pinned(closing, /Backlog refine: skipped #\{n\} — premise changed since confirmation \(flag-back concurrent grant agreed: live \{live grant\}, this run RECOMMEND_BUILD=true\); dropped without writing\./, PRE_TEMPLATES,
    'flag-back agreed-form skip template missing');
  pinned(closing, /Backlog refine: skipped #\{n\} — premise changed since confirmation \(flag-back concurrent grant DIVERGED: live \{live grant\}, this run discarded RECOMMEND_BUILD=false — \{grant-check RATIONALE\}\); dropped without writing\./, PRE_TEMPLATES,
    'flag-back DIVERGED-form skip template must name the discarded RECOMMEND_BUILD value and its rationale');
});

test('AC1.1: flag-back comparison judges the RECOMMEND_BUILD verdict, not the flag-back reason', () => {
  pinned(closing, /\*\*Flag-back concurrent-grant comparison \(#3324\)\.\*\*[\s\S]{0,700}this run's own `RECOMMEND_BUILD` verdict[\s\S]{0,300}not the reason the row was flagged back/, PRE_TEMPLATES,
    'flag-back comparison must judge agreement against RECOMMEND_BUILD, not the flag-back reason');
});

test('AC1.1: a no-verdict flag-back row keeps the generic skip line, never agreed/DIVERGED', () => {
  pinned(closing, /`concurrent grant: live \{live grant\}; flag-back row, no grant-check verdict to compare`/, PRE_TEMPLATES,
    'a flag-back row with no grant-check verdict must name its {what changed} without claiming agreement or divergence');
});

test('AC1.1: other flag-back skips keep the generic line', () => {
  pinned(closing, /\*\*Flag-back concurrent-grant comparison \(#3324\)\.\*\*[\s\S]{0,2200}gained `risk:\*`\/`size:\*`\/`bot:in-progress` without `auto:build`[\s\S]{0,200}keeps? the generic line/, PRE_TEMPLATES,
    'flag-back rows that gained no auto:build must keep the generic skip line');
});

test('AC2.1: one grep finds every flag-back divergence, and only those', () => {
  pinned(closing, /grep 'flag-back concurrent grant DIVERGED' "\$PIPELINE_RUN_DIR\/decisions\.md"/, PRE_TEMPLATES,
    'comparison rule must name the paste-ready grep for flag-back divergences');

  const lines = closing.split('\n').filter((l) => l.includes('concurrent grant') && l.startsWith('AUTO {time}'));
  assert.equal(lines.length, 4, 'expected 2 grant-row and 2 flag-back concurrent-grant template lines');

  const filled = lines.map((l) => l
    .replace(/\{time\}/g, '10:00:01')
    .replace(/\{n\}/g, '7')
    .replace(/\{live grant\}/g, 'auto:build')
    .replace(/\{grant-check RATIONALE\}/g, 'narrow fix'));

  const flagBackDiverged = filled.filter((l) => l.includes('flag-back concurrent grant DIVERGED'));
  assert.equal(flagBackDiverged.length, 1, 'exactly one line is the flag-back DIVERGED form');

  const anyDiverged = filled.filter((l) => l.includes('concurrent grant DIVERGED'));
  assert.equal(anyDiverged.length, 2, 'both DIVERGED forms match the shared grep pattern');

  const { counts, unclassified } = computeClosingTally('## /backlog\n' + filled.map((l) => '- ' + l).join('\n') + '\n');
  assert.equal(counts.skipped, 4);
  assert.deepEqual(unclassified, []);
});
