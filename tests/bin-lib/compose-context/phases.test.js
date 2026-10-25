'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PHASES, phaseBundles } = require('../../../plugin/bin/lib/compose-context/phases');
const { STEP_RE } = require('../../../plugin/bin/compose-context');

const PLUGIN = path.join(__dirname, '..', '..', '..', 'plugin');

test('PHASES registers exactly the three dispatch phases (#4027)', () => {
  assert.deepEqual(Object.keys(PHASES).sort(), ['first-call', 'review-lens', 'second-call']);
  assert.ok(Object.isFrozen(PHASES), 'the registry is frozen');
});

test('every bundle has a CLI-legal step, an existing plugin-relative source list, and a known load', () => {
  for (const [phase, { bundles }] of Object.entries(PHASES)) {
    assert.ok(bundles.length > 0, `${phase} has at least one bundle`);
    for (const bundle of bundles) {
      assert.match(bundle.step, STEP_RE, `${phase}: step ${bundle.step}`);
      assert.ok(['always', 'on-demand'].includes(bundle.load), `${phase}/${bundle.step}: load ${bundle.load}`);
      assert.ok(bundle.sources.length > 0, `${phase}/${bundle.step} has sources`);
      for (const src of bundle.sources) {
        assert.ok(fs.existsSync(path.join(PLUGIN, src)), `${phase}/${bundle.step}: ${src} exists under plugin/`);
      }
    }
  }
});

test('phaseBundles resolves each source to an absolute file under the plugin root, labelled by its registry path', () => {
  const bundles = phaseBundles('second-call', PLUGIN);
  assert.deepEqual(bundles.map((b) => [b.step, b.load]), [['claims', 'on-demand'], ['merge', 'always']]);
  assert.deepEqual(bundles[1].sources, [
    { label: 'skills/_shared/pr-first-merge.md', file: path.resolve(PLUGIN, 'skills/_shared/pr-first-merge.md') },
    { label: 'skills/_shared/pr-checklist-refresh.md', file: path.resolve(PLUGIN, 'skills/_shared/pr-checklist-refresh.md') },
  ]);
});

test('phaseBundles returns null for an unknown phase, including an inherited Object key', () => {
  assert.equal(phaseBundles('nope', PLUGIN), null);
  assert.equal(phaseBundles('constructor', PLUGIN), null);
});
