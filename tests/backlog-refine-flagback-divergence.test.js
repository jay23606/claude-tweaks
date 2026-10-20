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

// The #3324 flag-back paragraph as committed at 7a501343c, before fix round 1 — used only as
// go-red probes for the needs-scoring and re-authorize carve-out pins below.
const PRE_FLAGBACK_PARA = "**Flag-back concurrent-grant comparison (#3324).** When Step 5's pre-write reverify drops a flag-back row because the record's live labels gained `auto:build` since Step 1 (with or without another of the reverify's flag-back labels), compare that live grant (`{live grant}`: `auto:build`, `auto:build + auto:merge`, or `auto:build + auto:merge-pending`) against this run's own `RECOMMEND_BUILD` verdict for the row before logging. That means the grant-check verdict itself, not the reason the row was flagged back: a Step 3.5 body-shape downgrade, a needs-scoring row, or a human override in Step 4 can flag back a row whose verdict was `RECOMMEND_BUILD: true`. A flag-back row with no verdict (Step 3's `no verdict rendered` outcome) keeps the generic skip line, with `{what changed}` = `concurrent grant: live {live grant}; flag-back row, no grant-check verdict to compare`. It never reads \"agreed\" or \"DIVERGED\". For every other flag-back row, the live grant always carries `auto:build`, so the verdict alone decides: **agreed** when `RECOMMEND_BUILD` is `true`, **diverged** when it is `false`. Log the matching flag-back line above. The DIVERGED form carries this run's grant-check RATIONALE verbatim, carrying the same write-versus-verdict caveat as the grant-row form. A flag-back row that gained `risk:*`/`size:*`/`bot:in-progress` without `auto:build`, or that hit a live-state fetch failure, keeps the generic line. Both forms count as `skipped`. Every flag-back divergence of one sweep is listed by `grep 'flag-back concurrent grant DIVERGED' \"$PIPELINE_RUN_DIR/decisions.md\"`. The grant-row grep above also matches these lines, so one `grep 'concurrent grant DIVERGED'` lists every divergence of either kind.";

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

// Fix round 1: a needs-scoring row is always RECOMMEND_BUILD: false (refine-lanes.md's
// flag back (needs scoring) rows), so it can never be a true-verdict flag-back example.
test('AC1.1: the flag-back paragraph says a needs-scoring row always carries RECOMMEND_BUILD false', () => {
  pinned(closing, /a needs-scoring row always carries `RECOMMEND_BUILD: false`/, PRE_FLAGBACK_PARA,
    'the flag-back paragraph must state that a needs-scoring row always carries RECOMMEND_BUILD false');
});

// Fix round 1: a re-authorize (bot:blocked) row a human flags back in Step 4 was never
// grant-checked (Step 3 skips it), so it has no verdict and must keep the generic line.
test('AC1.1: the no-verdict carve-out names a human-flagged re-authorize row', () => {
  pinned(closing, /a re-authorize \(`bot:blocked`\) row a human flagged back in Step 4/, PRE_FLAGBACK_PARA,
    'the no-verdict carve-out must name a re-authorize (bot:blocked) row a human flagged back in Step 4');
});
