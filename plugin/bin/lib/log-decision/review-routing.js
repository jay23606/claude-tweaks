// Compose one /review Step 3 Routing log line (#4488) — pure, no I/O.
// The gate in /claude-tweaks:release Step 3 classifies these lines by the literal
// tokens `critical finding` and `high-severity finding` (blocking) and
// `medium-severity finding` / `applied low-severity` (findings), so the text is
// fixed here rather than hand-typed per routing site. The write itself is
// log-decision.js's (bin/review-routing-line.js wires the two together).
'use strict';

const ROUTES = ['auto', 'staged', 'kept-prompt'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const ROUTING_STEP = 'Step 3 Routing';
const ALLOWED_SEVERITIES = {
  auto: ['low', 'medium'],
  staged: ['low', 'medium', 'high'],
  'kept-prompt': ['critical'],
};
const STAGE_PATH_RE = /^staged\/review-\d+\.patch$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
// The release gate classifies Step 3 lines by these literals; a category must never inject one.
const GATE_TOKEN_RE = /severity finding|critical finding/i;

function singleLineProblem(flag, value) {
  if (typeof value !== 'string' || !value.trim()) return `${flag} is required (a non-empty string)`;
  if (/[\r\n]/.test(value)) return `${flag} must be a single line`;
  return null;
}

// { route, severity, category, at, stagePath?, commit? } -> { status, text, reversibility } | { error }.
// `text` never begins with `Step 3 Routing:` (the step prefix is log-decision's to write), so the
// --text repeat refusal never fires on a composed line.
function composeRoutingLine({ route, severity, category, at, stagePath, commit }) {
  if (!ROUTES.includes(route)) return { error: `--route must be one of ${ROUTES.join('|')}` };
  const sev = typeof severity === 'string' ? severity.toLowerCase() : severity;
  if (!SEVERITIES.includes(sev)) return { error: `--severity must be one of ${SEVERITIES.join('|')}` };
  if (!ALLOWED_SEVERITIES[route].includes(sev)) {
    return { error: `--route ${route} does not take --severity ${sev} (allowed: ${ALLOWED_SEVERITIES[route].join('|')})` };
  }
  const problem = singleLineProblem('--category', category) || singleLineProblem('--at', at);
  if (problem) return { error: problem };
  if (GATE_TOKEN_RE.test(category)) return { error: '--category must not contain "severity finding" or "critical finding" (a release-gate token)' };

  if (route === 'auto') {
    if (stagePath != null) return { error: '--stage-path is not valid with --route auto' };
    if (typeof commit !== 'string' || !COMMIT_RE.test(commit)) return { error: '--commit must be a 7-40 character lowercase hex commit sha' };
    return { status: 'AUTO', text: `applied ${sev}-severity ${category} fix at ${at}`, reversibility: `high (commit ${commit})` };
  }
  if (route === 'staged') {
    if (commit != null) return { error: '--commit is not valid with --route staged' };
    if (typeof stagePath !== 'string' || !STAGE_PATH_RE.test(stagePath)) {
      return { error: '--stage-path must match staged/review-{n}.patch with --route staged' };
    }
    return { status: 'STAGED', text: `${sev}-severity finding ${category} at ${at}. Stage path: ${stagePath}`, reversibility: 'high' };
  }
  if (stagePath != null) return { error: '--stage-path is not valid with --route kept-prompt' };
  if (commit != null) return { error: '--commit is not valid with --route kept-prompt' };
  return { status: 'KEPT-PROMPT', text: `critical finding ${category} at ${at}. Surfaced inline`, reversibility: 'high' };
}

module.exports = { composeRoutingLine, ROUTES, SEVERITIES, ROUTING_STEP };
