// tests/design-intent-multi-value-conformance.test.js
// Pins #3018's multi-value Design-intent prose against the live skill files:
// the Manifesto states the header list is authoritative over the run lever,
// polish reads the materialized header's comma list, and materialize.md
// describes the normalization and the invalid-value hard gate.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { readText } = require('./helpers/read-skill');

const REPO_ROOT = path.join(__dirname, '..');

function read(rel) {
  return readText(path.join(REPO_ROOT, rel));
}

const MANIFESTO = 'plugin/skills/flow/manifesto.md';
const POLISH = 'plugin/skills/design-wrapper/modes/polish.md';
const MATERIALIZE = 'plugin/skills/flow/materialize.md';

function lineStarting(text, prefix) {
  const line = text.split('\n').find((l) => l.startsWith(prefix));
  assert.ok(line, `no line starting with ${prefix}`);
  return line;
}

test('manifesto Design intent (4) row states the header list is authoritative over the run lever', () => {
  const row = lineStarting(read(MANIFESTO), '| **Design intent** (4)');
  assert.match(row, /run[- ]level setting/i, 'names the lever as a run-level setting');
  assert.match(row, /header.{0,80}authoritative/i, 'names the per-record header list as authoritative');
});

test('manifesto Design intent recommendation row says the lever is run-level only', () => {
  const row = lineStarting(read(MANIFESTO), '| Design intent | `none`');
  assert.match(row, /run-level setting only/i, 'Why column limits the lever to a run-level setting');
});

test('polish multi-intent paragraph reads the materialized header comma list and ignores empty entries', () => {
  const para = lineStarting(read(POLISH), '**Multi-intent ordering.**');
  assert.match(para, /materialized header/i, 'names the materialized header as the source');
  assert.match(para, /empty entr/i, 'ignores empty entries (legacy trailing comma tolerated)');
  assert.ok(para.includes('invoke commands in the order declared'), 'keeps the dispatch-order sentence');
});

test('materialize.md describes the design-intent normalization', () => {
  const text = read(MATERIALIZE);
  assert.match(text, /splits on[\s\S]{0,200}trims/i, 'CLI splits on , and trims each value');
});

test('materialize.md hard gate names the invalid Design-intent exit', () => {
  const text = read(MATERIALIZE);
  assert.match(text, /invalid `Design-intent:`[\s\S]{0,300}exits 1/i, 'invalid value makes bin/materialize.js exit 1');
});
