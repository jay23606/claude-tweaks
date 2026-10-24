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
const { lstatType } = require('../path-guard');

// Staged review files that carry one finding of their own.
const STAGED_FINDING_RE = /^review-(unconfirmed|contested|debate)-/;

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
// Reporter severities a tiebreak could file at (unknown counts as medium).
const FILEABLE_SEVERITIES = new Set(['critical', 'high', 'medium']);
const LOCATION_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+):(\d+)/g;
const PATH_SHAPED_RE = /[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/;
// Reproduction-meta phrases: they describe how a finding was (not) reproduced,
// never the finding itself. Multi-word phrases first, so a lone word cannot
// split one.
const META_PHRASES = [/present in only one\b[^)]*/gi, /partner agents?\b[^)]*/gi, /single agent/gi, /single[- ]read/gi, /no findings/gi, /\breproduc\w*/gi, /\bagents?\b/gi];
const STAGED_FILE_RE = /staged\/([A-Za-z0-9_-]+\.(?:md|patch))/;
// The producer's own staging note, in any case and followed by any of `.` `:` `;` ` —` or nothing
// (`Staged to Review Console as low-confidence`, `both staged as low-confidence`, mid-sentence lowercase).
const STAGING_NOTE_RE = /(?:\bboth\s+)?\bstaged\s+(?:to\s+Review\s+Console\s+)?as\s+low-confidence\b(?:[.:;]|\s*—)?/gi;
const BOILERPLATE = [/not reproduced/g, STAGING_NOTE_RE, /Reversibility: \S+\./g, /Artifact: [^.]*\./g];
// A ledger-row reference is meta about the console's ledger, never about the finding (R17).
const LEDGER_REF_RE = /(?:\b[\w-]+\s+case\s*=\s*)?(?:\b(?:already|same\s+as)\s+)?\bledger\s+(?:row\s+|#)\d+\b\s*[,;]?/gi;
// A trailing clause outside parentheses that only points at the ledger (`— ledger row 8.`, `ledger item 4`,
// `same as ledger row 4 (observation)`, `same observation already ledgered as row 6 (observation)`) is meta too.
const TRAILING_LEDGER_RE = /(?:\s*—\s*|\s+)(?:(?:same\s+as\s+)?ledger\s+(?:row|item)\s+\d+|same\s+observation\s+already\s+ledgered\s+as\s+row\s+\d+)(?:\s*\([^()]*\))?\s*\.?\s*$/i;
// What a multi-location list leaves in front of a claim: separators, `and`, and bare line refs (`:335`, `-133`, `/127`).
const LEAD_FRAGMENT_RE = /^(?:\s+|[:\-/]\d+(?:-\d+)?(?=[\s.,;/)]|$)|[/,;:.)—](?!\d)|and\b(?=\s*(?:[/,:.\-]|$)))+/;

const defaultDeps = {
  readFile: (p) => fs.readFileSync(p, 'utf8'),
  readdir: (p) => {
    try { return fs.readdirSync(p); } catch { return []; }
  },
  // The one listing that must not read a failure as "empty": a run dir's own entries.
  readdirStrict: (p) => fs.readdirSync(p),
  // Every path checked here is a file about to be read. Only `missing` is
  // absent: a symlink is read through, and a directory, other node or
  // unreadable leaf counts as present so the read throws and the console is
  // named unreadable rather than read as having no such file.
  exists: (p) => lstatType(p).type !== 'missing',
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

// A word has a letter: a bare line ref (`:335`) left by a location list is not one.
const wordCount = (text) => text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;

// A parenthetical loses its ledger-row references (dropped whole when nothing else is left), then
// holding reproduction meta loses those phrases, and is dropped whole when fewer than 3 words
// remain; one with neither is kept as written.
function cleanParenthetical(inner) {
  let text = inner;
  let ledger = false;
  text = text.replace(LEDGER_REF_RE, () => { ledger = true; return ''; });
  if (ledger) {
    text = text.replace(/\s+/g, ' ').replace(/^[\s,;:]+|[\s,;]+$/g, '');
    if (wordCount(text) === 0) return '';
  }
  let meta = false;
  let stripped = text;
  for (const re of META_PHRASES) stripped = stripped.replace(re, () => { meta = true; return ''; });
  if (!meta) return `(${text})`;
  return wordCount(stripped) < 3 ? '' : `(${stripped.replace(/\s+/g, ' ').trim()})`;
}

// The whole segment is the claim: reproduction-meta parentheticals and the producer's
// boilerplate come out, whitespace squashes, the location-list fragments in front go, and a claim
// that is exactly one parenthetical (with at most a lone trailing `.`) is unwrapped.
function cleanSegment(segment) {
  let text = segment.replace(/\(([^()]*)\)/g, (whole, inner) => cleanParenthetical(inner));
  for (const re of BOILERPLATE) text = text.replace(re, '');
  text = text.replace(/\s+/g, ' ').replace(TRAILING_LEDGER_RE, '').replace(LEAD_FRAGMENT_RE, '').replace(/[\s,;]+$/, '').replace(/\s+\.$/, '').trim();
  const whole = /^\(([^()]*)\)\s*\.?$/.exec(text);
  return whole ? whole[1].trim() : text;
}

// `low-confidence` describes the staging, never a severity.
function severityOf(text) {
  const m = /\b(critical|high|medium|low|info)\b(?!-confidence)/.exec(text);
  return m ? m[1] : null;
}

// The location tokens that start a finding: never one inside a parenthetical,
// and never a `:N-M` range after the first split point — that range is a
// cross-reference continuing the previous finding's claim.
function splitPoints(line) {
  const depthAt = [];
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    depthAt[i] = depth;
    if (line[i] === '(') depth += 1;
    else if (line[i] === ')' && depth > 0) depth -= 1;
  }
  const points = [];
  for (const m of line.matchAll(LOCATION_RE)) {
    if (depthAt[m.index] > 0) continue;
    const end = m.index + m[0].length;
    if (points.length > 0 && /^-\d/.test(line.slice(end))) continue;
    points.push({ path: m[1], line: Number(m[2]), start: m.index, end });
  }
  return points;
}

// One legacy decisions.md line → its findings. A finding's claim is the text
// between its location and the next split point (or the line's end).
// `located` is every location the line names ({ lens, path, line }), claim or not: a line whose
// findings all lack a claim keeps its locations for the no-claim item that stands for it.
function analyseLine(line) {
  const tokens = splitPoints(line);
  if (!tokens.length) {
    const m = PATH_SHAPED_RE.exec(line);
    if (!m) return { findings: [], noClaim: 'no-path', located: [] };
    tokens.push({ path: m[0], line: null, start: m.index, end: m.index + m[0].length });
  }
  const lensMatch = /lens\s+"?([A-Za-z0-9_-]+)/.exec(line);
  const lens = lensMatch ? lensMatch[1] : 'unknown';
  const findings = tokens.map((t, k) => {
    const cleaned = cleanSegment(line.slice(t.end, k + 1 < tokens.length ? tokens[k + 1].start : line.length));
    return { lens, path: t.path, line: t.line, claim: wordCount(cleaned) < 4 ? '' : cleaned, severity: severityOf(cleaned) };
  });
  const located = findings.map((f) => ({ lens: f.lens, path: f.path, line: f.line }));
  if (findings.every((f) => f.claim === '')) return { findings: [], noClaim: 'claim-empty', located };
  return { findings, noClaim: null, located };
}

function splitDecisionLine(line) {
  const { findings, noClaim } = analyseLine(line);
  return { findings, noClaim };
}

const reporterSeverity = (s) => (s && SEVERITIES.includes(s) ? s : 'medium');
const findingKindOf = (section) => (section === SECTIONS.CONTESTED ? 'contested' : 'unconfirmed');
const findingKeyOf = (f, k) => `${f.lens}|${f.path}:${f.line}#${k}`;

// A new-shape coordination id (`…#{8 hex}`) may carry a `-{n}` repeat suffix
// for a byte-identical repeated line; it names the same line, so it groups and
// matches without the suffix (resolve.js's coordinationItems).
const normalizeDecisionId = (id) => id.replace(/(#[0-9a-f]{8})-\d+$/, '$1');

// The new shape's hash pins one exact line. The old 58-character shape can
// match any line sharing that lead-in, so it skips the lines coordinationItems
// never made an item of (resolve.js): tiebreak verdicts, and lines naming a
// staged file that exists (that file is the item).
function decisionLineMatches(line, groupId, readStaged) {
  if (`decision:${line.slice(2, 60)}#${sha256(line).slice(0, 8)}` === groupId) return true;
  if (line.slice(2, 60) !== groupId.slice('decision:'.length)) return false;
  if (parseTiebreakLine(line)) return false;
  const named = STAGED_FILE_RE.exec(line);
  return !(named && readStaged(named[1]) !== null);
}

// The items one source line yields: a finding item per finding, or one no-claim
// item for a line with no path or no claim at all. A finding whose own claim is
// empty, on a line whose other findings have one, is its own no-claim item.
// A no-claim item from a located finding keeps the location (`finding: { lens, path, line }`, no
// claim): the digest line names the file. The id derivation does not read it, so ids do not move.
function lineItems(line, base, runId, section) {
  const split = analyseLine(line);
  if (split.noClaim) {
    const located = split.located.length ? { finding: split.located[0], locations: split.located } : {};
    return [{ ...base, itemId: backfillItemId({ runId, sourceKey: line, findingKey: '' }), kind: 'no-claim', noClaimReason: split.noClaim, ...located, context: line, bundleLine: line }];
  }
  return split.findings.map((f, k) => (f.claim === '' ? {
    ...base,
    itemId: backfillItemId({ runId, sourceKey: line, findingKey: findingKeyOf(f, k) }),
    kind: 'no-claim',
    noClaimReason: 'claim-empty',
    finding: { lens: f.lens, path: f.path, line: f.line },
    context: line,
    bundleLine: line,
  } : {
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
  // No `Finding:` line: the digest text (backfill-dispose.js), which skips a header block, metadata and a
  // table header; the joined text only when that yields nothing. Required here, not at the top: backfill-dispose
  // requires backfill-apply, which requires this module.
  const joined = () => text.split('\n').filter((l) => !/^\s*#/.test(l)).join(' ');
  const claim = (findingLine ? findingLine[1] : require('./backfill-dispose').digestTextOf(text) || joined()).replace(/\s+/g, ' ').replace(/^[\s:;,.)]+/, '').trim();
  const where = { lens: lens ? lens[1] : 'unknown', path: loc ? loc[1] : shaped[0], line: loc ? Number(loc[2]) : null };
  if (!claim) return { ...base, itemId, kind: 'no-claim', noClaimReason: 'claim-empty', finding: where, context: text };
  return {
    ...base,
    itemId,
    kind: 'finding',
    finding: {
      ...where,
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
      const matched = stagedLines.filter((line) => decisionLineMatches(line, key, readStaged));
      if (!matched.length) {
        out.push({ ...base, itemId: backfillItemId({ runId, sourceKey: id, findingKey: '' }), kind: 'no-claim', noClaimReason: 'source-line-not-found', context: id });
        continue;
      }
      for (const line of matched) out.push(...lineItems(line, base, runId, section));
    } else if (typeof id === 'string' && id.startsWith('bf:')) {
      const source = typeof item.backfillSource === 'string' ? item.backfillSource : null;
      const own = source === null ? null : lineItems(source, single, runId, section).find((w) => w.itemId === id);
      out.push(own || { ...single, itemId: id, kind: 'no-claim', noClaimReason: 'source-line-not-found', context: source || id });
    } else if (typeof id === 'string' && id.startsWith('tiebreak:')) {
      const tid = id.slice('tiebreak:'.length);
      const verdicts = decisionLinesAll.map((l) => ({ l, t: parseTiebreakLine(l) })).filter(({ t }) => t && t.id === tid);
      const v = verdicts.length ? verdicts[verdicts.length - 1] : null;
      const itemId = backfillItemId({ runId, sourceKey: id, findingKey: '' });
      if (!v) { out.push({ ...single, itemId, kind: 'no-claim', noClaimReason: 'source-line-not-found', context: id }); continue; }
      const entry = findings.find((f) => f && f.id === tid);
      const claim = entry && typeof entry.claim === 'string' ? entry.claim.replace(/\s+/g, ' ').trim() : '';
      if (!claim) { out.push({ ...single, itemId, kind: 'no-claim', noClaimReason: 'claim-empty', finding: { lens: v.t.lens, path: v.t.path, line: v.t.line }, context: v.l }); continue; }
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

// A run's consoles: the run's own console.json, then each spec-*/console.json. Throws when
// the run dir cannot be listed (removed mid-call, unreadable): the caller names the run unreadable.
function consolePathsOf(runDir, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  return [path.join(runDir, 'console.json'), ...d.readdirStrict(runDir).filter((n) => /^spec-/.test(n)).sort().map((n) => path.join(runDir, n, 'console.json'))];
}

// One console's inputs, read fresh: { state: 'absent' } when it has no console.json,
// { state: 'unreadable', path } naming the file that exists but could not be read or
// parsed, else { state: 'ok', consoleDir, consoleJson, decisions, findings, readStaged,
// runId } — the arguments consoleWorkItems and backfill-apply.js's applyToConsole take.
function readConsole(consolePath, deps = {}) {
  const d = { ...defaultDeps, ...deps };
  const consoleDir = path.dirname(consolePath);
  let consoleJson;
  try {
    const raw = readIfPresent(d, consolePath);
    if (raw === null) return { state: 'absent' };
    consoleJson = JSON.parse(raw);
  } catch { return { state: 'unreadable', path: consolePath }; }
  if (!consoleJson || typeof consoleJson !== 'object') return { state: 'unreadable', path: consolePath };
  const decisionsPath = path.join(consoleDir, 'decisions.md');
  let decisions;
  try { decisions = readIfPresent(d, decisionsPath) || ''; } catch { return { state: 'unreadable', path: decisionsPath }; }
  // The tiebreak artifact: absent reads as []; present but unreadable, unparseable
  // or not an array makes the console unreadable rather than claimless.
  const findingsPath = path.join(consoleDir, 'review-findings.json');
  let findings;
  try {
    const raw = readIfPresent(d, findingsPath);
    findings = raw === null ? [] : JSON.parse(raw);
  } catch { findings = null; }
  if (!Array.isArray(findings)) return { state: 'unreadable', path: findingsPath };
  const readStaged = (name) => readIfPresent(d, path.join(consoleDir, 'staged', name));
  return { state: 'ok', consoleDir, consoleJson, decisions, findings, readStaged, runId: runIdOf(consoleDir) };
}

function buildWorkList({ pipelinesRoot, mainSha, deps = {} }) {
  const d = { ...defaultDeps, ...deps };
  const { closed, live } = enumerateRuns(pipelinesRoot, d);
  const runs = [];
  const unreadable = [];
  for (const runDir of closed) {
    const items = [];
    let consolePaths;
    try { consolePaths = consolePathsOf(runDir, d); } catch { unreadable.push(runDir); continue; }
    for (const consolePath of consolePaths) {
      const read = readConsole(consolePath, d);
      if (read.state === 'absent') continue;
      if (read.state === 'unreadable') { unreadable.push(read.path); continue; }
      try {
        items.push(...consoleWorkItems(read));
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
  STAGED_FINDING_RE, enumerateRuns, splitDecisionLine, backfillItemId, itemHashOf, consoleWorkItems, consolePathsOf, readConsole, buildWorkList, summarize,
};
