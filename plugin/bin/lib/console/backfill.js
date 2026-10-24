// plugin/bin/lib/console/backfill.js — the Review Console backlog backfill's
// work list (#3950). Walks every closed run (acknowledged consoles included —
// an acknowledgement silenced the banner, it settled nothing) and turns each
// unresolved stored item into work items the apply step can settle. A legacy
// `decision:` item bundles a whole decisions.md line, which can carry several
// findings, so it is split into one item per finding with a content-derived
// `bf:` id. Read-only: the CLI's apply mode (backfill-apply.js) is the only
// console.json writer. Something that exists but cannot be read or parsed is
// named in `unreadable` and emits no items — never "no claim", never settled.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { classifyStagedItem, SHADOW_DUP_RE, SECTIONS, runIdOf, parseTiebreakLine } = require('./resolve');
const { UNRESOLVED_RESOLUTIONS } = require('./residue');
const { readRunState, isStaleClaim, RUN_ID_RE } = require('../hooks/context');

// Staged review files that carry one finding of their own.
const STAGED_FINDING_RE = /^review-(unconfirmed|contested|debate)-/;

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
// Reporter severities a tiebreak could file at (unknown counts as medium).
const FILEABLE_SEVERITIES = new Set(['critical', 'high', 'medium']);
const LOCATION_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)/g;
const PATH_SHAPED_RE = /[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/;
const DROPPED_PARENTHETICAL_RE = /\b(agent|agents|reproduc\w*|single[- ]read|no findings)\b/i;
const BOILERPLATE = [/not reproduced/g, /Staged to Review Console as low-confidence\./g, /Reversibility: \S+\./g, /Artifact: [^.]*\./g];

const defaultDeps = {
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  readdir: (p) => {
    try { return fs.readdirSync(p); } catch { return []; }
  },
  exists: fs.existsSync,
  isDir: (p) => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
  },
};

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function backfillItemId({ runId, sourceKey, findingKey }) {
  return `bf:${sha256(`${runId}\n${sourceKey}\n${findingKey}`).slice(0, 16)}`;
}

function itemHashOf(storedItems) {
  return sha256(JSON.stringify(storedItems));
}

// Closed runs, newest first by basename, with scanUnresolvedConsoles' twin
// rules (session-residue.js): a top-level run is closed when its run-state is
// `clean` and its archive twin is neither clean nor freshly `archiving`; any
// other top-level run is live — reported, never walked — and its archive copy,
// when there is one, stands in. A basename in both places is walked once.
function enumerateRuns(pipelinesRoot, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const archiveRoot = path.join(pipelinesRoot, 'archive');
  const names = (dir) => new Set(d.readdir(dir).filter((n) => RUN_ID_RE.test(n) && d.isDir(path.join(dir, n))));
  const top = names(pipelinesRoot);
  const archived = names(archiveRoot);
  const closed = [];
  const live = [];
  for (const name of [...new Set([...top, ...archived])].sort().reverse()) {
    if (top.has(name)) {
      const twin = archived.has(name) ? readRunState(path.join(archiveRoot, name)) : null;
      const twinDone = Boolean(twin && (twin.status === 'clean' || (twin.status === 'archiving' && !isStaleClaim(twin))));
      if (!twinDone) {
        const runDir = path.join(pipelinesRoot, name);
        const state = readRunState(runDir);
        if (state && state.status === 'clean') { closed.push(runDir); continue; }
        live.push({ runDir, status: (state && state.status) || 'unknown' });
      }
    }
    if (archived.has(name)) closed.push(path.join(archiveRoot, name));
  }
  return { closed, live };
}

// Drop the parentheticals that only describe the reproduction, then the
// producer's boilerplate; squash whitespace.
function cleanSegment(segment) {
  let text = segment.trim();
  if (text.startsWith('(')) {
    const close = text.indexOf(')');
    if (close !== -1) text = text.slice(0, close + 1);
  }
  text = text.replace(/\(([^()]*)\)/g, (whole, inner) => (DROPPED_PARENTHETICAL_RE.test(inner) ? '' : whole));
  for (const re of BOILERPLATE) text = text.replace(re, '');
  return text.replace(/\s+/g, ' ').trim();
}

function severityOf(text) {
  const m = /\b(critical|high|medium|low|info)\b/.exec(text);
  return m ? m[1] : null;
}

// One legacy decisions.md line → its findings. A finding's claim is the text
// between its location and the next one (or the line's end).
function splitDecisionLine(line) {
  const tokens = [...line.matchAll(LOCATION_RE)].map((m) => ({ path: m[1], line: Number(m[2]), start: m.index, end: m.index + m[0].length }));
  if (!tokens.length) {
    const m = PATH_SHAPED_RE.exec(line);
    if (!m) return { findings: [], noClaim: 'no-path' };
    tokens.push({ path: m[0], line: null, start: m.index, end: m.index + m[0].length });
  }
  const lensMatch = /lens\s+"?([A-Za-z0-9_-]+)/.exec(line);
  const lens = lensMatch ? lensMatch[1] : 'unknown';
  const findings = tokens.map((t, k) => {
    const cleaned = cleanSegment(line.slice(t.end, k + 1 < tokens.length ? tokens[k + 1].start : line.length));
    const words = cleaned.split(' ').filter((w) => /[A-Za-z0-9]/.test(w)).length;
    return { lens, path: t.path, line: t.line, claim: words < 4 ? '' : cleaned, severity: severityOf(cleaned) };
  });
  if (findings.every((f) => f.claim === '')) return { findings: [], noClaim: 'claim-empty' };
  return { findings, noClaim: null };
}

const reporterSeverity = (s) => (s && SEVERITIES.includes(s) ? s : 'medium');
const findingKindOf = (section) => (section === SECTIONS.CONTESTED ? 'contested' : 'unconfirmed');
const findingKeyOf = (f, k) => `${f.lens}|${f.path}:${f.line}#${k}`;

// A new-shape coordination id (`…#{8 hex}`) may carry a `-{n}` repeat suffix
// for a byte-identical repeated line; it names the same line, so it groups and
// matches without the suffix (resolve.js's coordinationItems).
const normalizeDecisionId = (id) => id.replace(/(#[0-9a-f]{8})-\d+$/, '$1');

function decisionLineMatches(line, groupId) {
  const body = groupId.slice('decision:'.length);
  return line.slice(2, 60) === body || `decision:${line.slice(2, 60)}#${sha256(line).slice(0, 8)}` === groupId;
}

// The items one source line yields: a finding item per finding, or one no-claim item.
function lineItems(line, base, runId, section) {
  const split = splitDecisionLine(line);
  if (split.noClaim) {
    return [{ ...base, itemId: backfillItemId({ runId, sourceKey: line, findingKey: '' }), kind: 'no-claim', noClaimReason: split.noClaim, context: line, bundleLine: line }];
  }
  return split.findings.map((f, k) => ({
    ...base,
    itemId: backfillItemId({ runId, sourceKey: line, findingKey: findingKeyOf(f, k) }),
    kind: 'finding',
    finding: { lens: f.lens, path: f.path, line: f.line, reporterSeverity: reporterSeverity(f.severity), kind: findingKindOf(section) },
    claimText: f.claim,
    context: line,
    bundleLine: line,
  }));
}

function stagedFindingItem(name, text, base, itemId, section) {
  const loc = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)/.exec(text);
  const shaped = loc ? null : PATH_SHAPED_RE.exec(text);
  if (!loc && !shaped) return { ...base, itemId, kind: 'no-claim', noClaimReason: 'no-path', context: text };
  const sev = /Severity:\s*(\w+)/.exec(text);
  const lens = /Lens:\s*([\w-]+)/.exec(text) || /lens\s+"?([\w-]+)/.exec(text);
  const findingLine = /^[-*\s]*Finding:\**\s*(.+)$/m.exec(text);
  const claim = (findingLine ? findingLine[1] : text.split('\n').filter((l) => !/^\s*#/.test(l)).join(' ')).replace(/\s+/g, ' ').trim();
  if (!claim) return { ...base, itemId, kind: 'no-claim', noClaimReason: 'claim-empty', context: text };
  return {
    ...base,
    itemId,
    kind: 'finding',
    finding: {
      lens: lens ? lens[1] : 'unknown',
      path: loc ? loc[1] : shaped[0],
      line: loc ? Number(loc[2]) : null,
      reporterSeverity: reporterSeverity(sev && sev[1].toLowerCase()),
      kind: /^review-unconfirmed-/.test(name) ? 'unconfirmed' : 'contested',
    },
    claimText: claim,
    context: text,
  };
}

// The work items of one console. `readStaged(name)` returns a staged file's
// text, or null when it is absent. `findings` is the run's review-findings.json
// (the tiebreak artifact), read for a `tiebreak:` item's claim.
function consoleWorkItems({ consoleDir, consoleJson, decisions, readStaged, runId, findings = [] }) {
  const stored = consoleJson && Array.isArray(consoleJson.items) ? consoleJson.items : [];
  const stagedLines = [...new Set(String(decisions || '').split('\n').filter((l) => l.startsWith('- STAGED ')))];
  const decisionLinesAll = String(decisions || '').split('\n');
  const unresolved = stored.map((item, index) => ({ item, index })).filter(({ item }) => item && UNRESOLVED_RESOLUTIONS.has(item.resolution));

  const groups = new Map();
  for (const { item, index } of unresolved) {
    if (typeof item.id !== 'string' || !item.id.startsWith('decision:')) continue;
    const key = normalizeDecisionId(item.id);
    groups.set(key, [...(groups.get(key) || []), index]);
  }

  const out = [];
  const emitted = new Set();
  for (const { item, index } of unresolved) {
    const id = item.id;
    const section = item.section;
    const single = { itemHash: itemHashOf([item]), section, consoleDir, storedIndices: [index] };
    if (typeof id === 'string' && id.startsWith('decision:')) {
      const key = normalizeDecisionId(id);
      if (emitted.has(key)) continue;
      emitted.add(key);
      const indices = groups.get(key);
      const base = { itemHash: itemHashOf(indices.map((i) => stored[i])), section, consoleDir, storedIndices: indices };
      const matched = stagedLines.filter((line) => decisionLineMatches(line, key));
      if (!matched.length) {
        out.push({ ...base, itemId: backfillItemId({ runId, sourceKey: id, findingKey: '' }), kind: 'no-claim', noClaimReason: 'source-line-not-found', context: id });
        continue;
      }
      for (const line of matched) out.push(...lineItems(line, base, runId, section));
    } else if (typeof id === 'string' && id.startsWith('bf:') && typeof item.backfillSource === 'string') {
      const own = lineItems(item.backfillSource, single, runId, section).find((w) => w.itemId === id);
      out.push(own || { ...single, itemId: id, kind: 'no-claim', noClaimReason: 'source-line-not-found', context: item.backfillSource });
    } else if (typeof id === 'string' && id.startsWith('tiebreak:')) {
      const tid = id.slice('tiebreak:'.length);
      const verdicts = decisionLinesAll.map((l) => ({ l, t: parseTiebreakLine(l) })).filter(({ t }) => t && t.id === tid);
      const v = verdicts.length ? verdicts[verdicts.length - 1] : null;
      const itemId = backfillItemId({ runId, sourceKey: id, findingKey: '' });
      if (!v) { out.push({ ...single, itemId, kind: 'no-claim', noClaimReason: 'source-line-not-found', context: id }); continue; }
      const entry = findings.find((f) => f && f.id === tid);
      const claim = entry && typeof entry.claim === 'string' ? entry.claim.replace(/\s+/g, ' ').trim() : '';
      if (!claim) { out.push({ ...single, itemId, kind: 'no-claim', noClaimReason: 'claim-empty', context: v.l }); continue; }
      out.push({
        ...single,
        itemId,
        kind: 'finding',
        finding: { lens: v.t.lens, path: v.t.path, line: v.t.line, reporterSeverity: reporterSeverity(v.t.severity), kind: findingKindOf(section) },
        claimText: claim,
        context: v.l,
      });
    } else if (typeof id === 'string' && id !== '' && !id.includes(':')) {
      const itemId = backfillItemId({ runId, sourceKey: `staged/${id}`, findingKey: '' });
      const text = readStaged(id);
      if (text === null || text === undefined) {
        out.push({ ...single, itemId, kind: 'no-claim', noClaimReason: 'staged-file-absent', context: id });
      } else if (STAGED_FINDING_RE.test(id)) {
        out.push(stagedFindingItem(id, text, single, itemId, section));
      } else {
        const anchor = SHADOW_DUP_RE.exec(id);
        const anchorText = anchor ? readStaged(anchor[1]) : undefined;
        out.push({ ...single, itemId, kind: 'staged-kind', staged: { name: id, ...classifyStagedItem(id, text, anchorText) } });
      }
    } else {
      // An engine row ({row}:{label}) has no staged file and no finding.
      const name = typeof id === 'string' ? id : null;
      out.push({ ...single, itemId: backfillItemId({ runId, sourceKey: String(name), findingKey: '' }), kind: 'staged-kind', staged: { name, section, reason: 'engine-row' } });
    }
  }
  return out;
}

// Reads `file`: null when absent, else its text; throws when it exists but cannot be read.
function readIfPresent(d, file) {
  return d.exists(file) ? d.readFile(file) : null;
}

function buildWorkList({ pipelinesRoot, mainSha, deps = {} }) {
  const d = { ...defaultDeps, ...deps };
  const { closed, live } = enumerateRuns(pipelinesRoot, d);
  const runs = [];
  const unreadable = [];
  for (const runDir of closed) {
    const consolePaths = [path.join(runDir, 'console.json'), ...d.readdir(runDir).filter((n) => /^spec-/.test(n)).sort().map((n) => path.join(runDir, n, 'console.json'))];
    const items = [];
    for (const consolePath of consolePaths) {
      const consoleDir = path.dirname(consolePath);
      let consoleJson;
      let decisions;
      try {
        const raw = readIfPresent(d, consolePath);
        if (raw === null) continue;
        consoleJson = JSON.parse(raw);
      } catch { unreadable.push(consolePath); continue; }
      if (!consoleJson || typeof consoleJson !== 'object') { unreadable.push(consolePath); continue; }
      const decisionsPath = path.join(consoleDir, 'decisions.md');
      try { decisions = readIfPresent(d, decisionsPath) || ''; } catch { unreadable.push(decisionsPath); continue; }
      let findings = [];
      try {
        const parsed = JSON.parse(readIfPresent(d, path.join(consoleDir, 'review-findings.json')) || '[]');
        if (Array.isArray(parsed)) findings = parsed;
      } catch { /* absent or unparseable tiebreak artifact reads as [] (resolve.js's readRunFiles) */ }
      const readStaged = (name) => readIfPresent(d, path.join(consoleDir, 'staged', name));
      try {
        items.push(...consoleWorkItems({ consoleDir, consoleJson, decisions, readStaged, runId: runIdOf(consoleDir), findings }));
      } catch { unreadable.push(consolePath); }
    }
    runs.push({ runDir, items });
  }
  return { mainSha, runs, live, unreadable };
}

function summarize(workList) {
  const items = workList.runs.flatMap((r) => r.items);
  const byKind = { finding: 0, 'no-claim': 0, 'staged-kind': 0 };
  for (const it of items) byKind[it.kind] += 1;
  return {
    runs: workList.runs.filter((r) => r.items.length > 0).length,
    consoles: new Set(items.map((it) => it.consoleDir)).size,
    items: items.length,
    byKind,
    findingsMaxFiled: items.filter((it) => it.kind === 'finding' && FILEABLE_SEVERITIES.has(it.finding.reporterSeverity)).length,
  };
}

module.exports = {
  STAGED_FINDING_RE, enumerateRuns, splitDecisionLine, backfillItemId, itemHashOf, consoleWorkItems, buildWorkList, summarize,
};
