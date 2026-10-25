// plugin/bin/lib/flow/manifesto.js — /flow Step 3's Pipeline Config Manifesto
// write, as one procedure (#4027): compute the 13 levers, write config.yml,
// initialize decisions.md with the config snapshot header, create staged/,
// and log the Manifesto's own decision lines. The behavior spec stays
// plugin/skills/flow/manifesto.md (lever list, Recommendation defaults,
// Source values, Approval flow / Write mechanism); bin/manifesto-write.js is
// the CLI. This is the fresh-run path (adoption cases 2 and 5): a run dir that
// already carries config.yml is case 1 and is refused (AdoptedRunError), and
// one whose decisions.md already carries a snapshot header is case 3's
// recovery, also refused (InitializedLogError) — case 3 prefers that header's
// values over a fresh computation, which this module does not do.
//
// Writers: config.yml levers and the run pin only through
// bin/lib/set-config/write.js (every value validated before any is written);
// decisions.md lines only through bin/lib/log-decision/append.js's
// formatEntry/appendEntry, so each line is byte-identical to what
// bin/log-decision.js writes for the argv manifesto.md dictates. The header
// prepend is a read-modify-write of the shared decisions.md, so it runs under
// the same `.decisions.lock` and tmp+rename appendEntry uses.
//
// Order is chosen so each partial failure leaves a state the adoption cases
// already recover: the header first (a later failure leaves a snapshot-headed
// decisions.md with no config.yml — case 3, whose recovery reads that header),
// then staged/, then config.yml (a failure mid-batch removes the partial file,
// so it never reads as a complete case-1 config), then the log lines.
'use strict';

const fs = require('fs');
const path = require('path');
const { MANIFESTO_LEVERS, LEVER_LABELS, validateLever, setConfigLever } = require('../set-config/write');
const { formatEntry, appendEntry } = require('../log-decision/append');
const { withLock } = require('../file-lock');
const { writeFileAtomic } = require('../atomic-write');
const { lstatType } = require('../path-guard');
const { LEVER_KEYS } = require('./preflight');

const MODES = Object.freeze(['auto', 'confirm', 'hybrid']);
const MODE_SOURCES = Object.freeze(['arg', 'dispatch', 'policy', 'default']);
const CEREMONIES = Object.freeze(['fast-lane', 'standard']);
const CEREMONY_SOURCES = Object.freeze(['label', 'judged']);
const SECTION = '/flow';
// `created:` is the run id's timestamp prefix (_shared/run-dir-resolution.md's
// ISO-timestamp rule: YYYY-MM-DDTHHMMSS, UTC, no colons).
const CREATED_RE = /^(\d{4}-\d{2}-\d{2}T\d{6})(?:-|$)/;
const HEADER_RE = /^(?:# Auto-Decision Log\b|Pipeline config snapshot:)/m;

// The keys resolved through preflight's resolvePolicy: preflight's LEVER_KEYS
// minus ceremony-profile (folded from the records, source `header`) and
// merge-authorization (always `ask` here — never a policy.yml value), plus
// `autonomy` (the review-auto-apply-ceiling rule reads it) and the run pin.
const POLICY_REQUEST_KEYS = Object.freeze([
  ...LEVER_KEYS.filter((k) => k !== 'ceremony-profile' && k !== 'merge-authorization'),
  'autonomy',
  'integration-model',
]);

class ManifestoInputError extends Error {
  constructor(message) { super(message); this.name = 'ManifestoInputError'; }
}
class AdoptedRunError extends Error {
  constructor(message) { super(message); this.name = 'AdoptedRunError'; }
}
class InitializedLogError extends Error {
  constructor(message) { super(message); this.name = 'InitializedLogError'; }
}
class LeverError extends Error {
  constructor(message) { super(message); this.name = 'LeverError'; }
}

function checkRecords(records) {
  if (!Array.isArray(records) || records.length === 0) throw new ManifestoInputError('at least one record is required');
  const seen = new Set();
  for (const r of records) {
    if (!r || !Number.isInteger(r.n) || r.n <= 0) throw new ManifestoInputError(`record number must be a positive integer: ${r && r.n}`);
    if (seen.has(r.n)) throw new ManifestoInputError(`record #${r.n} appears more than once`);
    seen.add(r.n);
    if (!CEREMONIES.includes(r.ceremony)) throw new ManifestoInputError(`record #${r.n}: ceremony must be ${CEREMONIES.join(' or ')}, got ${r.ceremony}`);
    if (!CEREMONY_SOURCES.includes(r.ceremonySource)) throw new ManifestoInputError(`record #${r.n}: ceremonySource must be ${CEREMONY_SOURCES.join(' or ')}, got ${r.ceremonySource}`);
  }
}

// { mode, modeSource, records, resolved } -> [{ key, value, source }] for all
// 13 levers in MANIFESTO_LEVERS order. `resolved` is preflight's resolvePolicy
// result over POLICY_REQUEST_KEYS ({key: {value, source, invalid?, error?}}).
function computeLevers({ mode, modeSource, records, resolved }) {
  if (!MODES.includes(mode)) throw new ManifestoInputError(`mode must be one of ${MODES.join(', ')} (interactive runs no Manifesto), got ${mode}`);
  if (!MODE_SOURCES.includes(modeSource)) throw new ManifestoInputError(`mode source must be one of ${MODE_SOURCES.join(', ')}, got ${modeSource}`);
  checkRecords(records);
  const res = resolved || {};
  const autonomy = res.autonomy && res.autonomy.value;
  return MANIFESTO_LEVERS.map((key) => {
    // `confirm` is "auto mode, but gate the Manifesto" (flow/SKILL.md Step 1).
    if (key === 'mode') return { key, value: mode === 'confirm' ? 'auto' : mode, source: modeSource };
    if (key === 'ceremony-profile') {
      return { key, value: records.every((r) => r.ceremony === 'fast-lane') ? 'fast-lane' : 'standard', source: 'header' };
    }
    if (key === 'merge-authorization') return { key, value: 'ask', source: 'default' };
    const entry = res[key];
    if (!entry || entry.error !== undefined || entry.value === null || entry.value === undefined) {
      throw new LeverError(`lever ${key} did not resolve${entry && entry.error ? ` (${entry.error})` : ''}`);
    }
    const source = entry.source || 'default';
    // Ceiling-conditional default (manifesto.md's Recommendation defaults):
    // an unattended run has nobody to answer a staged MED finding.
    if (key === 'review-auto-apply-ceiling' && source === 'default' && autonomy === 'unattended') {
      return { key, value: 'medium', source };
    }
    return { key, value: String(entry.value), source };
  });
}

// The auto-mode FYI table (manifesto.md's "Present the Manifesto", auto
// variant), with the Source column. A dispatch-sourced mode renders as
// `auto (dispatched run)` (manifesto.md's Source values).
function renderFyi(levers) {
  const rows = levers.map((l) => {
    const value = l.key === 'mode' && l.source === 'dispatch' ? `${l.value} (dispatched run)` : l.value;
    return `| ${LEVER_LABELS[l.key]} | ${value} | ${l.source} |`;
  });
  return [
    '### Pipeline Config (auto)',
    '',
    '| Lever | Value | Source |',
    '|---|---|---|',
    ...rows,
    '',
    '→ proceeding (no approval needed) · run with `confirm` to review/override',
    '',
  ].join('\n');
}

// True when config.yml exists in any form (file, symlink, other). An lstat
// that fails for a reason other than absence is a filesystem failure: thrown.
function configPresent(runDir) {
  const t = lstatType(path.join(runDir, 'config.yml'));
  if (t.type === 'missing') return false;
  if (t.type === 'unreadable') throw new Error(`could not stat ${path.join(runDir, 'config.yml')} (${t.code})`);
  return true;
}

function runCreated(runDir) {
  const m = CREATED_RE.exec(path.basename(runDir));
  if (!m) throw new ManifestoInputError(`run dir basename is not a run id (YYYY-MM-DDTHHMMSS-…): ${path.basename(runDir)}`);
  return m[1];
}

function headerText(runId, levers, integrationModel) {
  return [
    `# Auto-Decision Log — pipeline ${runId}`,
    '',
    'Pipeline config snapshot:',
    ...levers.map((l) => `- ${l.key}: ${l.value}`),
    ...(integrationModel ? [`- integration-model: ${integrationModel}`] : []),
    '',
    '',
  ].join('\n');
}

// Prepends the snapshot header, keeping every existing line (Step 2.8's claim
// lines) verbatim below it.
function initDecisions(runDir, header) {
  return withLock(path.join(runDir, '.decisions.lock'), () => {
    const file = path.join(runDir, 'decisions.md');
    let existing = '';
    try { existing = fs.readFileSync(file, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (HEADER_RE.test(existing)) {
      throw new InitializedLogError(`${file} already carries a Pipeline config snapshot header — this run dir is a case 3 recovery (steps-and-gates.md), not a fresh Manifesto`);
    }
    if (existing && !existing.endsWith('\n')) existing += '\n';
    writeFileAtomic(file, header + existing);
  });
}

// { runDir, records, levers, integrationModel?, now } -> { configPath, table }.
// `integrationModel` is the resolved run pin, or null/'' when it resolved
// empty: the pair is then omitted (so the 13 levers still write) and a SKIP is
// logged — the omit-on-empty rule of manifesto.md's Write mechanism.
function writeManifesto({ runDir, records, levers, integrationModel = null, now }, deps = {}) {
  const set = deps.setConfigLever || setConfigLever;
  const append = deps.appendEntry || appendEntry;
  checkRecords(records);
  const created = runCreated(runDir);
  const configPath = path.join(runDir, 'config.yml');
  if (configPresent(runDir)) throw new AdoptedRunError(`config.yml already present: ${configPath} — a case-1 adoption; read preflight.levers instead`);

  if (!Array.isArray(levers) || levers.map((l) => l && l.key).join(',') !== MANIFESTO_LEVERS.join(',')) {
    throw new LeverError(`levers must be the 13 Manifesto levers in canonical order (${MANIFESTO_LEVERS.join(', ')})`);
  }
  const pin = typeof integrationModel === 'string' && integrationModel.trim() ? integrationModel.trim() : null;
  const pairs = [...levers.map((l) => ({ key: l.key, value: l.value })), ...(pin ? [{ key: 'integration-model', value: pin }] : [])];
  const problems = pairs.map(({ key, value }) => ({ key, value, v: validateLever(key, value) })).filter((p) => !p.v.ok);
  if (problems.length) {
    throw new LeverError(problems.map((p) => `${p.key}=${p.value} is not valid${p.v.allowed ? ` (allowed: ${p.v.allowed.join(', ')})` : ''}`).join('; '));
  }

  initDecisions(runDir, headerText(path.basename(runDir), levers, pin));
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  try {
    for (const { key, value } of pairs) set({ runDir, key, value });
    // spec:/created: are run bookkeeping, not levers — set-config refuses
    // them by design, so they are appended after the batch (Write mechanism).
    const spec = Math.min(...records.map((r) => r.n));
    fs.appendFileSync(configPath, `spec: ${spec}\ncreated: ${created}\n`);
  } catch (err) {
    let removed = true;
    try { fs.rmSync(configPath, { force: true }); } catch { removed = false; }
    throw new Error(`could not write ${configPath} (${err && err.message ? err.message : err}) — `
      + (removed ? 'the partial config.yml was removed' : 'the partial config.yml could NOT be removed: delete it before re-running'), { cause: err });
  }

  const log = (status, step, text, reversibility = 'n/a') => append({ runDir, section: SECTION, entry: formatEntry({ status, now, step, text, reversibility }) });
  for (const r of records) {
    if (r.ceremonySource === 'judged') log('AUTO', 'Manifesto ceremony-check', `#${r.n} carries no ceremony:* label -> CEREMONY: ${r.ceremony}`);
  }
  log('AUTO', 'Manifesto', `levers written to ${configPath}`);
  if (!pin) {
    log('SKIP', 'Manifesto', 'condition: integration-model resolved empty (invalid or unresolvable in policy.yml) → fallback: config.yml written without the run pin; the run proceeds unpinned');
  }
  const critique = levers.find((l) => l.key === 'design-critique');
  log('AUTO', 'Manifesto', `design-critique resolved to ${critique.value} (source: ${critique.source})`, 'n/a (a policy read, not a code mutation)');

  return { configPath, table: renderFyi(levers) };
}

module.exports = {
  MODES, MODE_SOURCES, POLICY_REQUEST_KEYS,
  ManifestoInputError, AdoptedRunError, InitializedLogError, LeverError,
  computeLevers, renderFyi, configPresent, runCreated, writeManifesto,
};
