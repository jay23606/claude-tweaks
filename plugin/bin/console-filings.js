#!/usr/bin/env node
// bin/console-filings.js — dedup the Review Console's can't-tell finding filings
// against every existing record, and write the proposals that remain (#3949).
//   node bin/console-filings.js --run <run-dir> --existing <issues.json> --out-dir <dir> [--only <item,...>] [--help]
// Plans one filing per can't-tell item (a console item carrying `tiebreak`,
// bin/lib/console/resolve.js's findingItems; bin/lib/console/finding-filing.js
// composes each). The default selection is every such item — the unattended rule,
// whatever the tiebreak recommended; --only <item,...> narrows it to the named
// item ids (the interactive Approve-all/Override selection). --existing is the
// `gh issue list --state all --json number,body --limit N` output (a JSON array of
// { number, body }; closed records included, so a closed record still dedups): its
// bodies' work-fingerprint markers build the fingerprint map (lib/issues/record.js).
// A planned filing whose fingerprint is in the map is reported under `deduped`; each
// remaining proposal is written to <out-dir>/console-filing-{n}.md. The Review
// Console's Queue-writes step files those proposals. Never calls gh.
// Prints JSON: { file: [{ item, fingerprint, title, proposal: <path> }],
//                deduped: [{ item, fingerprint, number }] }
// Exit 0 on success; 2 on a malformed invocation (a missing/unknown flag, an
// unreadable or unparseable --existing, an --only naming no can't-tell item); 3
// when the run dir is missing or not anchored under the main checkout (a
// worktree-local shadow — _shared/pipeline-run-dir.md's Anchoring section,
// [IL-127]), or --out-dir is unwritable. This is the Sanctioned-writer vocabulary
// (no exit 1), though the run dir is only read: the writes are the caller-named
// --out-dir's files, create-or-overwrite with no lock, so a caller reusing a
// directory owns what an earlier run left in it.
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveTarget } = require('./lib/stage-item/write');
const { findingItems } = require('./lib/console/resolve');
const { planFilings } = require('./lib/console/finding-filing');
const { FINDINGS_ARTIFACT } = require('./lib/tiebreak');
const { extractFingerprint, checkFingerprint, recordFingerprint } = require('./lib/issues/record');

const USAGE = 'usage: console-filings.js --run <run-dir> --existing <issues.json> --out-dir <dir> [--only <item,...>] [--help]\n'
  + '  exit 0 ok; 2 malformed invocation or unparseable --existing; 3 run dir missing/not anchored, or --out-dir unwritable\n';

const VALUE_FLAGS = { '--run': 'run', '--existing': 'existing', '--out-dir': 'outDir', '--only': 'only' };

function parseArgs(argv) {
  const o = {
    run: null, existing: null, outDir: null, only: null, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { o.help = true; continue; }
    if (!Object.hasOwn(VALUE_FLAGS, a)) return { error: `unknown argument: ${a}` };
    const v = argv[++i];
    if (typeof v !== 'string' || !v.trim() || v.startsWith('--')) return { error: `${a} requires a value` };
    o[VALUE_FLAGS[a]] = v;
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  mainRoot: undefined,
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
  writeFile: (p, s) => fs.writeFileSync(p, s),
  mkdir: (p) => fs.mkdirSync(p, { recursive: true }),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

// The fingerprint -> record number map from `gh issue list` rows. First record wins on a repeated
// fingerprint; a row with no marker, no body, or no positive-integer number contributes nothing.
function fingerprintMap(rows) {
  const map = {};
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const fp = extractFingerprint(row.body);
    if (fp && Number.isInteger(row.number) && row.number > 0 && checkFingerprint(map, fp) === null) recordFingerprint(map, fp, row.number);
  }
  return map;
}

// review-findings.json (tiebreak.js's FINDINGS_ARTIFACT): absent, unparseable or not an array reads as [].
function readFindings(deps, runDir) {
  try {
    const parsed = JSON.parse(deps.readFile(path.join(runDir, FINDINGS_ARTIFACT)));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`console-filings.js: ${message}\n${USAGE}`); return 2; };
  if (o.error) return usageError(o.error);
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');
  if (!o.existing) return usageError('--existing <issues.json> is required');
  if (!o.outDir) return usageError('--out-dir <dir> is required');
  let only = null;
  if (o.only !== null) {
    only = o.only.split(',').map((s) => s.trim()).filter(Boolean);
    if (!only.length) return usageError('--only names no item');
  }

  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) {
    deps.stderr(`console-filings.js: ${err && err.message}\n`);
    return 3;
  }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`console-filings.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`console-filings.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }

  let rows;
  try { rows = JSON.parse(deps.readFile(path.resolve(deps.cwd(), o.existing))); } catch (err) {
    return usageError(`--existing ${o.existing} is unreadable or not JSON (${err && err.message})`);
  }
  if (!Array.isArray(rows)) return usageError(`--existing ${o.existing} must be a JSON array of { number, body }`);

  let items = findingItems({ runDir: target.dir, deps }).filter((i) => i.tiebreak);
  if (only) {
    const unknown = only.filter((id) => !items.some((i) => i.id === id));
    if (unknown.length) return usageError(`--only names no can't-tell item: ${unknown.join(', ')}`);
    items = items.filter((i) => only.includes(i.id));
  }

  // A multi-spec per-spec run dir is {pipelines}/{parent-run-id}/spec-{N}: name the parent run too.
  const base = path.basename(target.dir);
  const runId = /^spec-\d+$/.test(base) ? `${path.basename(path.dirname(target.dir))}/${base}` : base;
  // findingItems carries the Approve-all defaults; this CLI's selection is the tiebreak itself, so every
  // selected item plans as filed.
  const planned = planFilings({ items: items.map((i) => ({ ...i, resolution: 'filed' })), findings: readFindings(deps, target.dir), runId });

  const known = fingerprintMap(rows);
  const result = { file: [], deduped: [] };
  const toWrite = [];
  for (const p of planned) {
    const number = checkFingerprint(known, p.fingerprint);
    if (number !== null) result.deduped.push({ item: p.item, fingerprint: p.fingerprint, number });
    else toWrite.push(p);
  }

  const outDir = path.resolve(deps.cwd(), o.outDir);
  try {
    if (toWrite.length) deps.mkdir(outDir);
    toWrite.forEach((p, i) => {
      const file = path.join(outDir, `console-filing-${i + 1}.md`);
      deps.writeFile(file, p.proposal);
      result.file.push({ item: p.item, fingerprint: p.fingerprint, title: p.title, proposal: file });
    });
  } catch (err) {
    deps.stderr(`console-filings.js: could not write --out-dir ${o.outDir} (${err && err.message})\n`);
    return 3;
  }
  deps.stdout(JSON.stringify(result) + '\n');
  return 0;
}

module.exports = { run, parseArgs, USAGE };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
