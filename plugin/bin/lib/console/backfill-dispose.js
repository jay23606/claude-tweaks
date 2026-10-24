// plugin/bin/lib/console/backfill-dispose.js — the Review Console backlog
// backfill's disposition table as code (#3950). Each work item (backfill.js)
// resolves to exactly one of: filed (a backlog record proposal), dropped (the
// tiebreak refuted it), digested (a materiality-digest line), or dismissed (a
// byte-identical staged duplicate) — no item is left pending, and a no-claim
// item is digested, never dropped. planBatch dedups the filings against the
// existing records' fingerprints and the digest lines against the digest's
// trusted comments, and emits the settled-entry list the apply step
// (backfill-apply.js) consumes. Pure apart from the default `readStaged`: no
// gh call, no write — the procedure files and posts, then fills each entry's
// `ref` (`null` here means "the procedure fills it").
'use strict';

const fs = require('fs');
const path = require('path');
const { SHADOW_DUP_RE, SECTIONS, runIdOf } = require('./resolve');
const { composeFindingProposal, fingerprintMap } = require('./finding-filing');
const { composeShadowDupProposal } = require('./shadow-dup-proposal');
const { BACKFILL_OUTCOMES, BACKFILL_SOURCES } = require('./backfill-apply');
const { materialityEntryLine, materialityFingerprint, isMaterialityDuplicate } = require('../health-core/materiality-digest');
const { extractFingerprint, checkFingerprint, defuse } = require('../issues/record');

const DIGEST_REASONS = Object.freeze({
  NO_CLAIM: 'console-backfill-no-claim',
  UNMAPPED_KIND: 'console-backfill-unmapped-kind',
  CONFIRMED_LOW: 'console-backfill-confirmed-low',
  CANT_TELL: 'tiebreak-cant-tell',
});

const OUTCOME_OF_ACTION = Object.freeze({ file: 'filed', digest: 'digested', drop: 'dropped', dismiss: 'dismissed' });
for (const outcome of Object.values(OUTCOME_OF_ACTION)) {
  if (!BACKFILL_OUTCOMES.includes(outcome)) throw new Error(`backfill-dispose: outcome ${outcome} is not one backfill-apply accepts`);
}
for (const source of ['tiebreak', 'staged-kind', 'digest']) {
  if (!BACKFILL_SOURCES.includes(source)) throw new Error(`backfill-dispose: source ${source} is not one backfill-apply accepts`);
}

const FINDING_FILED_SEVERITIES = new Set(['critical', 'high', 'medium']);
const KNOWN_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'info']);
const DIGEST_FINDING_MAX = 200;
const DEFAULT_LIMIT = 24;

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

// A digest entry field is one line and can never spell a marker (record.js's defuse): the entry's
// own fingerprint marker must be the only one on its line.
const oneLine = (s) => defuse(squash(s));

// A path under plugin/skills/{s}/ -> s; plugin/bin/lib/{m}/ -> m; any other plugin/bin/ file -> bin;
// else the path's first segment (tests, docs).
function areaOfPath(p) {
  const segs = String(p).replace(/\\/g, '/').replace(/^\.\//, '').split('/').filter(Boolean);
  let area = segs[0] || 'console';
  if (segs[0] === 'plugin' && segs[1] === 'skills' && segs.length > 3) area = segs[2];
  else if (segs[0] === 'plugin' && segs[1] === 'bin') area = segs[2] === 'lib' && segs.length > 4 ? segs[3] : 'bin';
  return area.toLowerCase();
}

// No path to read an area from: a reflect staged finding is `reflect`, everything else `console`.
function areaFor(item) {
  if (item.kind === 'finding' && item.finding && item.finding.path) return areaOfPath(item.finding.path);
  const name = item.staged && item.staged.name;
  return typeof name === 'string' && name.startsWith('reflect-') ? 'reflect' : 'console';
}

// The staged file's first body line: not blank, not a heading, not a `**Header:** value` line.
function firstBodyLine(text) {
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || /^\*\*[^*]+:\*\*/.test(line) || /^-{3,}$/.test(line)) continue;
    return line;
  }
  return '';
}

function digestEntryOf({ item, finding, fileRefs, deferReason, runId }) {
  const entry = {
    area: oneLine(areaFor(item)),
    finding: oneLine(finding).slice(0, DIGEST_FINDING_MAX),
    fileRefs: oneLine(fileRefs),
    deferReason,
    provenance: oneLine(runId),
  };
  return { entry, line: materialityEntryLine(entry), fingerprint: materialityFingerprint(entry) };
}

const locationOf = (f) => (f.line === null || f.line === undefined ? f.path : `${f.path}:${f.line}`);

function result(item, action, source, extra) {
  return { itemId: item.itemId, action, outcome: OUTCOME_OF_ACTION[action], source, ...extra };
}

// The can't-tell record shape composeFindingProposal reads, built from a work item. A finding with no
// line has none to cite, so the record names `unknown` rather than printing "null".
function findingProposal(item, verdict, runId, confirmed) {
  const f = item.finding;
  const composed = composeFindingProposal({
    item: {
      tiebreak: {
        id: item.itemId,
        lens: f.lens,
        path: f.path,
        line: f.line === null || f.line === undefined ? 'unknown' : f.line,
        severity: verdict.severity || f.reporterSeverity,
        reason: verdict.reason || 'unspecified',
        recommendation: verdict.recommendation,
      },
    },
    finding: { claim: item.claimText },
    runId,
    ...(confirmed ? { verdict: { kind: 'confirmed', evidence: verdict.evidence, mainSha: confirmed.mainSha } } : {}),
  });
  return { fingerprint: composed.fingerprint, title: composed.title, text: composed.proposal };
}

function disposeFinding({ item, verdict, runId, mainSha }) {
  const digestFor = (deferReason) => result(item, 'digest', 'tiebreak', {
    digest: digestEntryOf({ item, finding: item.claimText, fileRefs: locationOf(item.finding), deferReason, runId }),
  });
  switch (verdict.outcome) {
    case 'confirmed': {
      const severity = KNOWN_SEVERITIES.has(verdict.severity) ? verdict.severity : 'medium';
      if (!FINDING_FILED_SEVERITIES.has(severity)) return digestFor(DIGEST_REASONS.CONFIRMED_LOW);
      return result(item, 'file', 'tiebreak', { proposal: findingProposal(item, { ...verdict, severity }, runId, { mainSha }) });
    }
    case 'drop': {
      const ev = verdict.evidence;
      if (!ev) throw new TypeError('a drop verdict carries no evidence');
      return result(item, 'drop', 'tiebreak', { ref: squash(`${ev.path}:${ev.line} "${ev.quote}"`) });
    }
    case 'console':
      return result(item, 'file', 'tiebreak', { proposal: findingProposal(item, verdict, runId, null) });
    case 'digest':
      return digestFor(DIGEST_REASONS.CANT_TELL);
    default:
      throw new TypeError(`unknown verdict outcome: ${JSON.stringify(verdict.outcome)}`);
  }
}

function disposeNoClaim({ item, runId }) {
  return result(item, 'digest', 'digest', {
    digest: digestEntryOf({
      item,
      finding: `No claim recoverable (${item.noClaimReason}): ${item.context}`,
      fileRefs: 'general',
      deferReason: DIGEST_REASONS.NO_CLAIM,
      runId,
    }),
  });
}

function disposeStaged({ item, runId, readStaged }) {
  const s = item.staged;
  const read = (name) => readStaged(item.consoleDir, name);
  const shadow = typeof s.name === 'string' ? SHADOW_DUP_RE.exec(s.name) : null;

  if (s.outcome === 'shadow-dup-duplicate' && shadow) {
    return result(item, 'dismiss', 'staged-kind', { ref: `duplicate of staged/${shadow[1]}` });
  }
  let text = null;
  if (shadow && (s.outcome === 'shadow-dup-divergent' || s.outcome === 'shadow-dup-collision')) {
    text = read(s.name);
    const composed = composeShadowDupProposal({ name: s.name, text, anchorText: read(shadow[1]), runId });
    if (composed.ok) {
      return result(item, 'file', 'staged-kind', { proposal: { fingerprint: null, title: composed.title, text: composed.proposal } });
    }
  } else if (typeof s.name === 'string' && s.reason !== 'engine-row') {
    text = read(s.name);
    if (s.section === SECTIONS.QUEUE && !s.reason && typeof text === 'string' && text.startsWith('Title:')) {
      const title = squash(/^Title:(.*)$/m.exec(text)[1]);
      return result(item, 'file', 'staged-kind', { proposal: { fingerprint: extractFingerprint(text), title, text } });
    }
  }

  // Anything else: digested, with the file's name and why it had no mapping.
  const label = `${s.name === null || s.name === undefined ? 'unnamed engine row' : s.name} (${s.reason || s.section})`;
  const first = typeof text === 'string' ? firstBodyLine(text) : '';
  const files = typeof text === 'string' && typeof s.name === 'string' && s.name.startsWith('reflect-') ? /^\*\*Files:\*\*[ \t]*(.+)$/m.exec(text) : null;
  return result(item, 'digest', 'digest', {
    digest: digestEntryOf({
      item,
      finding: first ? `${label}: ${first}` : label,
      fileRefs: files && squash(files[1]) ? squash(files[1]) : 'general',
      deferReason: DIGEST_REASONS.UNMAPPED_KIND,
      runId,
    }),
  });
}

// ENOENT reads as absent (null); any other failure throws — an unreadable file is not an absent one.
const defaultReadStaged = (consoleDir, name) => {
  try { return fs.readFileSync(path.join(consoleDir, 'staged', name), 'utf8'); } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
};

// { item, verdict?, runId, mainSha, readStaged? } -> { itemId, action, outcome, source, ref?, proposal?, digest? }.
// `verdict` is resolve-tiebreak's JSON and is required for a `finding` item. `readStaged(consoleDir,
// name)` returns a staged file's text, or null when it is absent.
function disposeItem({ item, verdict, runId, mainSha, readStaged = defaultReadStaged }) {
  if (item.kind === 'finding') {
    if (!verdict) throw new TypeError('verdict required for a finding item');
    return disposeFinding({ item, verdict, runId, mainSha });
  }
  if (item.kind === 'no-claim') return disposeNoClaim({ item, runId });
  if (item.kind === 'staged-kind') return disposeStaged({ item, runId, readStaged });
  throw new TypeError(`unknown work item kind: ${JSON.stringify(item.kind)}`);
}

const verdictOf = (verdicts, id) => {
  if (!verdicts) return undefined;
  if (verdicts instanceof Map) return verdicts.get(id);
  return Object.hasOwn(verdicts, id) ? verdicts[id] : undefined;
};

// One batch of the work list, in order. Walks `workList.runs`; a finding with no verdict yet is listed
// under `awaitingVerdict` and takes no slot; stops after `limit` dispositions.
//   existingIssues  `gh issue list --state all --json number,body` rows (the fingerprint map's source)
//   digestComments  the open digest issue's comment objects, with their author association
// Returns { dispositions, file, reuse, digest: { lines, duplicates }, entries, awaitingVerdict }:
//   file     new records to create (a fingerprint-less proposal is always new)
//   reuse    a filing that already has a record (`number`), or repeats an earlier item of this batch
//            (`number: null`, `sameAs` that item)
//   digest   the lines to post; `duplicates` are items whose line is already posted or repeats one
//   entries  the settled list for backfill-apply; `ref` is pre-filled for drop/dismiss and for an
//            existing record, `null` where the procedure fills it (a new filing, a digest comment).
function planBatch({ workList, verdicts, existingIssues, digestComments, limit = DEFAULT_LIMIT, readStaged }) {
  const known = fingerprintMap(Array.isArray(existingIssues) ? existingIssues : []);
  const out = {
    dispositions: [], file: [], reuse: [], digest: { lines: [], duplicates: [] }, entries: [], awaitingVerdict: [],
  };
  const batchFiled = new Map();
  const batchDigested = new Set();

  for (const run of workList.runs) {
    for (const item of run.items) {
      if (out.dispositions.length >= limit) return out;
      const verdict = item.kind === 'finding' ? verdictOf(verdicts, item.itemId) : undefined;
      if (item.kind === 'finding' && !verdict) { out.awaitingVerdict.push(item.itemId); continue; }

      const d = disposeItem({
        item, verdict, runId: runIdOf(item.consoleDir), mainSha: workList.mainSha, ...(readStaged ? { readStaged } : {}),
      });
      out.dispositions.push(d);
      let ref = d.ref === undefined ? null : d.ref;

      if (d.action === 'file') {
        const fp = d.proposal.fingerprint;
        const number = fp ? checkFingerprint(known, fp) : null;
        if (number !== null) {
          out.reuse.push({ itemId: d.itemId, number });
          ref = `#${number}`;
        } else if (fp && batchFiled.has(fp)) {
          out.reuse.push({ itemId: d.itemId, number: null, sameAs: batchFiled.get(fp) });
        } else {
          if (fp) batchFiled.set(fp, d.itemId);
          out.file.push({ itemId: d.itemId, fingerprint: fp, title: d.proposal.title, text: d.proposal.text });
        }
      } else if (d.action === 'digest') {
        if (batchDigested.has(d.digest.fingerprint) || isMaterialityDuplicate(digestComments, d.digest.entry)) {
          out.digest.duplicates.push(d.itemId);
        } else {
          batchDigested.add(d.digest.fingerprint);
          out.digest.lines.push(d.digest.line);
        }
      }
      out.entries.push({
        runDir: run.runDir, itemId: d.itemId, itemHash: item.itemHash, outcome: d.outcome, source: d.source, ref,
      });
    }
  }
  return out;
}

module.exports = {
  DIGEST_REASONS, areaFor, disposeItem, planBatch,
};
