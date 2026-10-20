'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const fleet = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'routine', 'fleet.md'), 'utf8');

// Parses the Fleet composition table (under `## Fleet composition table`) into one
// object per numbered row. Cell values are backtick-stripped.
function compositionRows(md) {
  const lines = md.split('\n');
  const start = lines.indexOf('## Fleet composition table');
  assert.notStrictEqual(start, -1, 'no "## Fleet composition table" heading');
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) break;
    if (!line.startsWith('| ')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim().replace(/`/g, ''));
    if (!/^\d+$/.test(cells[0])) continue;
    rows.push({
      num: cells[0],
      bucket: cells[1],
      entry: cells[2],
      template: cells[3],
      focus: cells[4],
      cron: cells[5],
      name: cells[6],
    });
  }
  return rows;
}

test('AC1.1: composition table has a Vertical finder row whose focus override is security-hardening', () => {
  const row = compositionRows(fleet).find((r) => r.focus === 'security-hardening');
  assert.ok(row, 'no row with focus override security-hardening');
  assert.strictEqual(row.bucket, 'Vertical finder');
  assert.strictEqual(row.template, 'skills/code-health/routine-template.yml');
});

test('AC1.2: its PREFIXED_NAME is {REPO_SLUG}-code-health-security-hardening and its cron is distinct from every other row', () => {
  const rows = compositionRows(fleet);
  const row = rows.find((r) => r.focus === 'security-hardening');
  assert.strictEqual(row.name, '{REPO_SLUG}-code-health-security-hardening');
  assert.strictEqual(row.cron, '0 7 * * *');
  const crons = rows.map((r) => r.cron);
  assert.strictEqual(new Set(crons).size, crons.length, `duplicate cron among ${crons.join(', ')}`);
  // rows stay numbered 1..N with no gaps after the insert
  assert.deepStrictEqual(rows.map((r) => r.num), rows.map((_, i) => String(i + 1)));
});
