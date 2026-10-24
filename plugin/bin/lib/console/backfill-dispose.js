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
const { composeFindingProposal, findingFingerprint, fingerprintMap } = require('./finding-filing');
const { composeShadowDupProposal } = require('./shadow-dup-proposal');
const { BACKFILL_OUTCOMES, BACKFILL_SOURCES } = require('./backfill-apply');
const { materialityEntryLine, materialityFingerprint, isMaterialityDuplicate } = require('../health-core/materiality-digest');
const { fingerprintFromBasis } = require('../health-core/fingerprint');
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
  if (segs[0] === 'plugin' && segs[1] === 'skills') area = segs.length > 3 ? segs[2] : 'skills';
  else if (segs[0] === 'plugin' && segs[1] === 'bin') area = segs[2] === 'lib' && segs.length > 4 ? segs[3] : 'bin';
  return area.toLowerCase();
}

// An item that names a location (a finding, or a no-claim item standing for a located finding) takes
// its area from that path. No path to read an area from: a reflect staged finding is `reflect`,
// everything else `console`.
function areaFor(item) {
  if (item.finding && item.finding.path) return areaOfPath(item.finding.path);
  const name = item.staged && item.staged.name;
  return typeof name === 'string' && name.startsWith('reflect-') ? 'reflect' : 'console';
}

// ---- what a staged file says, for a digest line ----

const KEY_VALUE_RE = /^[A-Za-z][A-Za-z0-9 _-]{0,30}:(\s|$)/;
const METADATA_LINE_RE = /^(?:Ledger|Run|Mode|Source|Files):/i;
const TABLE_SEPARATOR_RE = /^\|[\s:|-]*-[\s:|-]*$/;
// Where a patch proposal's diff (or a dream proposal's quoted evidence) begins: nothing from here on
// is digest text. A bare `---` rule and a `- ` bullet are not diff lines.
const DIFF_START_RE = /^(?:diff --git |@@(?: |$)|--- |\+\+\+ |index [0-9a-f]+\.\.|```diff)/;
const SESSION_LINE_RE = /^-\s+Session\s+`/;

// A table data row as its non-numeric, non-empty cells joined by ` — ` (the row number and the
// `—` placeholder cells carry nothing).
function dataRowText(line) {
  const cells = line.split('|').map((c) => c.trim()).filter((c) => c !== '' && !/^\d+$/.test(c) && !/^[—–-]$/.test(c));
  return cells.join(' — ');
}

// The first thing worth reading in `lines`: skips headings, blank lines, the leading `Key: value`
// header block (when `skipHeaderBlock`), `**Key:**` lines, metadata lines (Ledger/Run/Mode/Source/Files),
// rules, and a markdown table's header and separator rows; a table data row reads as its cells; a
// prose line reads as itself, or as its whole paragraph when `paragraph`.
function firstContent(lines, { paragraph, skipHeaderBlock }) {
  let inHeader = false;
  let seenContent = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') { inHeader = false; continue; }
    if (line.startsWith('#')) continue;
    if (DIFF_START_RE.test(line)) return '';
    if (!seenContent) { seenContent = true; inHeader = skipHeaderBlock && KEY_VALUE_RE.test(line) && headerHasContentAfter(lines, i); }
    if (inHeader || /^\*\*[^*]+:\*\*/.test(line) || METADATA_LINE_RE.test(line) || SESSION_LINE_RE.test(line) || /^-{3,}$/.test(line) || line.startsWith('```')) continue;
    if (line.startsWith('|')) {
      if (TABLE_SEPARATOR_RE.test(line) || TABLE_SEPARATOR_RE.test((lines[i + 1] || '').trim())) continue;
      const row = dataRowText(line);
      if (row) return row;
      continue;
    }
    if (!paragraph) return line;
    const para = [];
    for (let j = i; j < lines.length && lines[j].trim() !== '' && !DIFF_START_RE.test(lines[j].trim()); j++) para.push(lines[j].trim());
    return para.join(' ');
  }
  return '';
}

// A leading `Key: value` run is a header block only when a blank line and more content follow it: a
// file that is nothing but `Note: a sentence` keeps its sentence.
function headerHasContentAfter(lines, from) {
  let j = from;
  while (j < lines.length && lines[j].trim() !== '') j++;
  return lines.slice(j).some((l) => l.trim() !== '');
}

// The `Key: value` lines that open a file (after any headings and blank lines), as { lowercased key: value }.
function leadingHeader(lines) {
  const header = {};
  let started = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!started && (line === '' || line.startsWith('#'))) continue;
    const m = /^([A-Za-z][A-Za-z0-9 _-]{0,30}):[ \t]*(.*)$/.exec(line);
    if (!m) break;
    started = true;
    const key = m[1].toLowerCase();
    if (!Object.hasOwn(header, key)) header[key] = m[2].trim();
  }
  return header;
}

// A staged file's digest text, never a diff line:
//   1. a patch proposal's header block: its `Finding:` value, else `Target: {value}`;
//   2. a dream proposal's `**Pattern:**` value;
//   3. the first paragraph under a `## Finding` heading;
//   4. the first content line.
function digestTextOf(text) {
  const lines = String(text).split(/\r?\n/);
  const header = leadingHeader(lines);
  if (header.finding) return header.finding;
  if (header.target) return `Target: ${header.target}`;
  const pattern = lines.map((l) => /^\*\*Pattern:\*\*[ \t]*(.+)$/.exec(l.trim())).find(Boolean);
  if (pattern && pattern[1].trim()) return pattern[1].trim();
  const start = lines.findIndex((l) => /^##\s+Finding\s*$/i.test(l));
  if (start >= 0) {
    const next = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    const section = firstContent(lines.slice(start + 1, next < 0 ? lines.length : next), { paragraph: true, skipHeaderBlock: false });
    if (section) return section;
  }
  return firstContent(lines, { paragraph: false, skipHeaderBlock: true });
}

// A decision line (`- STAGED HH:MM:SS — {step label}: {text}`) without its log prefix, and without up to
// two short step labels (`log-decision: `, `Step 3 reproduction: `, `Reproduction: `): the prefix costs
// the digest line's 200-character budget and says nothing about the finding. A label is a short run of
// plain words ending `: `, so a sentence that merely contains a colon is never cut. Anything else is returned as is.
// A `decision:` console id (the item's only trace when its source line is gone) is the same line cut to
// 58 characters plus a `#hash`: it loses the hash too. The producer's closing boilerplate ("Staged to
// Review Console as low-confidence. Reversibility: high.") goes as well; it is on every such line.
function withoutLogPrefix(context) {
  const prefix = /^(-\s+|decision:)(?:STAGED|AUTO)\s+\d{2}:\d{2}:\d{2}\s+—\s+/.exec(context);
  if (!prefix) return context;
  let rest = context.slice(prefix[0].length);
  if (prefix[1] === 'decision:') rest = rest.replace(/#[0-9a-f]{8}(?:-\d+)?$/, '');
  for (let n = 0; n < 2; n++) {
    const label = /^([A-Za-z0-9][A-Za-z0-9 _-]*): /.exec(rest);
    if (!label || label[1].length >= 40) break;
    rest = rest.slice(label[0].length);
  }
  return rest.replace(/\s*Staged to Review Console as low-confidence\.?/g, '').replace(/\s*Reversibility: \w+\.?/g, '').trim();
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
      return result(item, 'drop', 'tiebreak', { ref: squash(`${ev.path}:${ev.line ?? 'unknown'} "${ev.quote}"`) });
    }
    case 'console':
      return result(item, 'file', 'tiebreak', { proposal: findingProposal(item, verdict, runId, null) });
    case 'digest':
      return digestFor(DIGEST_REASONS.CANT_TELL);
    default:
      throw new TypeError(`unknown verdict outcome: ${JSON.stringify(verdict.outcome)}`);
  }
}

// A no-claim item that stands for a located finding names the location(s); otherwise `general`.
function noClaimFileRefs(item) {
  const where = Array.isArray(item.locations) && item.locations.length ? item.locations : [item.finding];
  const refs = [...new Set(where.filter((f) => f && f.path).map(locationOf))];
  return refs.length ? refs.join(', ') : 'general';
}

function disposeNoClaim({ item, runId }) {
  return result(item, 'digest', 'digest', {
    digest: digestEntryOf({
      item,
      finding: `No claim recoverable (${item.noClaimReason}): ${withoutLogPrefix(String(item.context))}`,
      fileRefs: noClaimFileRefs(item),
      deferReason: DIGEST_REASONS.NO_CLAIM,
      runId,
    }),
  });
}

// A filing whose text carries no work-fingerprint marker of its own (a shadow-dup reconcile record, a
// Queue-writes proposal without one) gets one minted from the item's content-derived id and appended
// as record.js's recordPayload writes it, so a record filed before a crashed apply is found by the next
// run's existing-records map instead of being filed a second time. A marker already in the text wins.
function withFingerprint(item, text) {
  const own = extractFingerprint(text);
  if (own) return { fingerprint: own, text };
  const fingerprint = fingerprintFromBasis('consolebackfill', [item.itemId]);
  const gap = text.endsWith('\n') ? '\n' : '\n\n';
  return { fingerprint, text: `${text}${gap}<!-- work-fingerprint: ${fingerprint} -->\nwork-fingerprint: ${fingerprint}\n` };
}

// A backfill filing never adds or removes an auto:* / bot:* label by itself (they are granted, not
// filed): any in the staged text's `Labels:` header line come out, the other labels stay, and a
// header line left with none is dropped. Only the header (up to the first blank line) is read.
function stripGrantLabels(text) {
  const blank = /\r?\n[ \t]*\r?\n/.exec(text);
  const split = blank ? blank.index : text.length;
  const head = text.slice(0, split).split('\n').map((line) => {
    const m = /^Labels:(.*?)(\r?)$/i.exec(line);
    if (!m) return line;
    const labels = m[1].split(',').map((l) => l.trim()).filter(Boolean);
    const kept = labels.filter((l) => !/^(?:auto|bot):/i.test(l));
    if (kept.length === labels.length) return line;
    return kept.length ? `Labels: ${kept.join(', ')}${m[2]}` : null;
  }).filter((line) => line !== null);
  return head.join('\n') + text.slice(split);
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
      const { fingerprint, text: proposal } = withFingerprint(item, composed.proposal);
      return result(item, 'file', 'staged-kind', { proposal: { fingerprint, title: composed.title, text: proposal } });
    }
  } else if (typeof s.name === 'string' && s.reason !== 'engine-row') {
    text = read(s.name);
    if (s.section === SECTIONS.QUEUE && !s.reason && typeof text === 'string' && text.startsWith('Title:')) {
      const stripped = stripGrantLabels(text);
      const title = squash(/^Title:(.*)$/m.exec(stripped)[1]);
      const { fingerprint, text: proposal } = withFingerprint(item, stripped);
      return result(item, 'file', 'staged-kind', { proposal: { fingerprint, title, text: proposal } });
    }
  }

  // Anything else: digested, with the file's name and why it had no mapping.
  const label = `${s.name === null || s.name === undefined ? 'unnamed engine row' : s.name} (${s.reason || s.section})`;
  const first = typeof text === 'string' ? digestTextOf(text) : '';
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
// A name that is not a plain file name (`../x`, `a/b`, `..`) reads as absent too: the item then digests
// as unmapped with its name in the line, instead of reading outside the staged directory or blocking the batch.
const defaultReadStaged = (consoleDir, name) => {
  if (typeof name !== 'string' || name === '' || name === '.' || name === '..' || name.includes('\\') || path.basename(name) !== name) return null;
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

// The fingerprint composeFindingProposal files this finding under (same lens, path and claim), or null
// when the item carries no claim to hash.
function prefiledFingerprint(item) {
  const f = item.finding;
  if (!f || typeof item.claimText !== 'string' || !item.claimText.trim()) return null;
  return findingFingerprint({ lens: f.lens, path: f.path, claim: item.claimText });
}

// One batch of the work list, in order. Walks `workList.runs`; a finding with no verdict yet is listed
// under `awaitingVerdict` and takes no slot — unless its filing fingerprint already has a record, which
// settles it as a `reuse` with no verdict, and so does one whose digest line a trusted digest comment
// already carries (settled `digested`, listed under `digest.duplicates`); stops after `limit` dispositions.
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
      if (item.kind === 'finding' && !verdict) {
        // A finding whose record already exists (filed by an earlier, interrupted run that never reached
        // apply) settles as that record without a verdict: re-judging it could drop a finding that is
        // already filed, orphaning the record. It takes a slot like any other disposition.
        const fp = prefiledFingerprint(item);
        const number = fp ? checkFingerprint(known, fp) : null;
        if (number !== null) {
          out.dispositions.push(result(item, 'file', 'tiebreak', { prefiled: true, proposal: { fingerprint: fp, title: null } }));
          out.reuse.push({ itemId: item.itemId, number });
          out.entries.push({
            runDir: run.runDir, itemId: item.itemId, itemHash: item.itemHash, outcome: 'filed', source: 'tiebreak', ref: `#${number}`,
          });
          continue;
        }
        // Likewise a finding whose digest line a trusted comment already carries (digested by an interrupted
        // run). Both digest outcomes (can't-tell, confirmed-low) build the line from the same area, claim and
        // location, and materialityFingerprint omits deferReason, so the fingerprint does not depend on the verdict.
        if (item.finding && typeof item.claimText === 'string' && item.claimText.trim()) {
          const prefiledDigest = digestEntryOf({
            item, finding: item.claimText, fileRefs: locationOf(item.finding), deferReason: DIGEST_REASONS.CANT_TELL, runId: runIdOf(item.consoleDir),
          });
          if (isMaterialityDuplicate(digestComments, prefiledDigest.entry)) {
            out.dispositions.push(result(item, 'digest', 'tiebreak', { prefiled: true, digest: prefiledDigest }));
            out.digest.duplicates.push(item.itemId);
            out.entries.push({
              runDir: run.runDir, itemId: item.itemId, itemHash: item.itemHash, outcome: 'digested', source: 'tiebreak', ref: null,
            });
            continue;
          }
        }
        out.awaitingVerdict.push(item.itemId);
        continue;
      }

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
