// bin/lib/console/finding-filing.js — plan the fileable backlog record for a
// can't-tell finding the Review Console resolved `filed` (#3949).
//
// At `autonomy: unattended` an agent that could not tell whether a finding holds
// is not licensed to drop it, so every can't-tell item is filed as a
// needs:definition record instead. This module only PLANS the filings
// (a `Title:`/`Type:`/`Labels:`/`Defer-reason:` header + spec-shaped body, the
// shape console/shadow-dup-proposal.js composes); writing them and deduplicating
// against existing records by fingerprint belongs to the consumer. The
// fingerprint excludes the line number so the same finding re-appearing at a
// shifted line in a later run dedupes to one record.
'use strict';

const { fingerprintFromBasis, normalizeText } = require('../health-core/fingerprint');
const {
  specShapedBody, recordPayload, fencedBlock, LABELS,
} = require('../issues/record');

const DEFER_REASON = 'needs-human-decision';
const TITLE_CLAIM_MAX = 80;

// { lens, path, claim } -> `consolefinding-{8 hex}`. No line number: it moves between runs.
function findingFingerprint({ lens, path, claim }) {
  return fingerprintFromBasis('consolefinding', [String(lens).trim().toLowerCase(), String(path).trim(), normalizeText(claim)]);
}

// The claim and path are producer-supplied text: the header is single-line by construction
// (whitespace collapsed before the cut), and the verbatim claim reaches the body only through fencedBlock.
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

// { item, finding, runId } -> { fingerprint, title, proposal }
// `item` is a console item carrying `tiebreak`; `finding` is the review-findings.json entry whose
// `id` equals item.tiebreak.id, or null — then the claim is `tiebreak:{id}`.
function composeFindingProposal({ item, finding, runId }) {
  const t = item.tiebreak;
  const claim = finding && typeof finding.claim === 'string' && finding.claim.trim() ? finding.claim : `tiebreak:${t.id}`;
  const fingerprint = findingFingerprint({ lens: t.lens, path: t.path, claim });
  const title = `Review finding (can't-tell): ${oneLine(t.path)} — ${oneLine(claim).slice(0, TITLE_CLAIM_MAX)}`;
  const where = `${t.path}:${t.line}`;
  const body = recordPayload({
    title,
    type: 'task',
    deferReason: DEFER_REASON,
    fingerprint,
    body: specShapedBody({
      provenance: { origin: `wrap-up Review Console, run ${runId}: can't-tell finding ${where}`, deferReason: DEFER_REASON },
      currentState: [
        `Review lens \`${oneLine(t.lens)}\` reported a finding at \`${where}\` (severity ${t.severity}). The claim follows verbatim.`,
        fencedBlock(claim),
        `The tiebreak could not settle it: can't-tell (${t.reason}). Recommendation: ${t.recommendation || 'none'}. Run: ${runId}.`,
      ],
      deliverables: '- [ ] decide whether the finding holds at the cited location; fix it if it does, or close this record if it does not',
      openQuestion: `Does this finding hold at \`${where}\`?`,
      releaseNote: 'No user-visible change.',
      filedBy: 'review-console',
      footer: '_Filed by `review-console` via specShapedBody._',
    }),
  }).body;
  return {
    fingerprint,
    title,
    proposal: `Title: ${title}\nType: task\nLabels: ${LABELS.NEEDS_DEFINITION}\nDefer-reason: ${DEFER_REASON}\n\n${body}`,
  };
}

// { items, findings, runId } -> [{ item, fingerprint, title, proposal }]: one per item resolved
// `filed` that carries `tiebreak`, deduplicated by fingerprint within the batch (first wins).
function planFilings({ items, findings, runId }) {
  const byId = new Map((Array.isArray(findings) ? findings : []).map((f) => [f && f.id, f]));
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (item.resolution !== 'filed' || !item.tiebreak) continue;
    const composed = composeFindingProposal({ item, finding: byId.get(item.tiebreak.id) || null, runId });
    if (seen.has(composed.fingerprint)) continue;
    seen.add(composed.fingerprint);
    out.push({ item: item.id, ...composed });
  }
  return out;
}

module.exports = { findingFingerprint, composeFindingProposal, planFilings };
