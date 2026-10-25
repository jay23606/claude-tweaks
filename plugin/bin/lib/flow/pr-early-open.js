// bin/lib/flow/pr-early-open.js — the PR-early run lifecycle's run-start half
// as one call (#4027): skills/_shared/pr-early-run-lifecycle.md's gh-present
// Steps 1-4 plus its "Resume: reconcile a recorded PR" section. That file
// stays the spec; this module implements it so an agent runs one CLI
// (bin/pr-early-open.js) instead of hand-running eight to ten commands.
//
// Every decisions.md line it writes is the spec's own text, word for word,
// formatted by log-decision/append.js's formatEntry exactly as
// `log-decision.js --section "/build" --status AUTO --text ... --reversibility ...`
// would write it, because pre-tool-use.js's checkBookkeepingStampsGate reads
// them: hasPrEarlyStep1LineFor needs a Step 1 line before the first push, and
// hasLoggedPrDegrade releases a PR-less run only on a `... FAILED` line. No
// other line may contain the word "failed" in any case (that regex is
// case-insensitive), which is why the reopen-rejected line carries no reason.
//
// deps: { gh(args) -> stdout (throws on failure), git(args, {cwd}) -> stdout,
//   sleep(ms), now(), appendDecision(line), recordPr({number, url}),
//   readRunState() -> run-state object | null, readDecisions() -> string,
//   writeBodyFile(name, text) -> path, readFile(path) -> string }.
// A gh/git read whose answer the procedure cannot do without (pr list, a
// non-404 pr view failure, unparseable JSON) throws; the CLI maps a throw to
// exit 1.
'use strict';

const path = require('path');
const { composePrEarlyBody } = require('./pr-body');
const { formatEntry } = require('../log-decision/append');

const RETRY_WAIT_MS = 15000;

// Step 2's push retries a failure that names no auth/ref problem; anything
// matching this is final on the first attempt.
const AUTH_OR_REF_RE = /auth|credential|permission|denied|\b40[13]\b|could not read (?:username|password)|repository not found|rejected|non-fast-forward|fetch first|does not appear to be a git repository|no such remote|src refspec|protected branch/i;
// Step 3's create retries once either way; only this signature waits 15 s first.
const TRANSIENT_RE = /\b5\d\d\b|server error|bad gateway|service unavailable|gateway time-?out|timed? ?out|timeout|deadline exceeded|ETIMEDOUT|ECONNRESET|connection reset/i;
// `gh pr view` on a PR that is gone.
const NOT_FOUND_RE = /could not resolve to a pullrequest|no pull requests? found|not found|\b404\b/i;

function errText(e) {
  const parts = [e && e.stderr, e && e.message].map((p) => (p == null ? '' : String(p).trim())).filter(Boolean);
  return parts.length ? parts[0] : String(e);
}

// A reason lands inside one decisions.md line: one line, bounded.
function oneLine(s) {
  const flat = String(s || 'unknown error').replace(/\s+/g, ' ').trim();
  return flat.length > 200 ? `${flat.slice(0, 197)}...` : flat;
}

function parseJson(stdout, what) {
  try { return JSON.parse(stdout); } catch {
    throw new Error(`could not parse ${what} output: ${oneLine(stdout)}`);
  }
}

// build/adopted-branch-collision-check.md's `prior-attempt` line, scoped to
// this branch: the closed PR number that check verified, or null.
function adoptedPriorAttemptPr(decisions, branch) {
  const re = /adopted prior attempt \S+ from closed PR #(\d+) for (\S+?)\.?(?:\s|$)/g;
  let found = null;
  for (const m of String(decisions || '').matchAll(re)) {
    if (m[2] === branch) found = Number(m[1]);
  }
  return found;
}

// `gh pr create` prints the new PR's URL as its last stdout line.
function createdPr(stdout) {
  const url = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => /\/pull\/\d+$/.test(l)).pop();
  if (!url) throw new Error(`gh pr create printed no PR URL: ${oneLine(stdout)}`);
  return { number: Number(/\/pull\/(\d+)$/.exec(url)[1]), url };
}

async function openPrEarly(opts, deps) {
  const { runDir, worktree, branch, repo, base, target, fixes = [], title, summary } = opts;
  const nextStep = opts.nextStep || 'build';
  const runId = path.basename(runDir);

  const log = (text, reversibility, status = 'AUTO') => deps.appendDecision(formatEntry({
    status, now: deps.now(), text: `PR-early run lifecycle: ${text}`, reversibility,
  }));
  const listPrs = () => {
    const v = parseJson(deps.gh(['pr', 'list', '--repo', repo, '--head', branch, '--state', 'all',
      '--json', 'number,url,state,isDraft']), 'gh pr list');
    if (!Array.isArray(v)) throw new Error('gh pr list did not return an array');
    return v;
  };
  const record = (number, url) => deps.recordPr({ number, url });

  // Resume: a recorded PR is re-verified before it is trusted.
  const state = deps.readRunState ? deps.readRunState() : null;
  const recorded = state && state.pr && Number.isInteger(state.pr.number) && state.pr.number > 0 ? state.pr : null;
  let stale = null;
  if (recorded) {
    let view = null;
    try {
      view = parseJson(deps.gh(['pr', 'view', String(recorded.number), '--repo', repo, '--json', 'state,isDraft,url']), 'gh pr view');
    } catch (e) {
      if (!NOT_FOUND_RE.test(errText(e))) throw e;
    }
    if (view && view.state === 'OPEN') return { outcome: 'reused', number: recorded.number, url: view.url || recorded.url };
    stale = recorded.number;
  }
  const logStale = (verb, number) => {
    if (stale !== null) log(`recorded PR #${stale} no longer open; ${verb} #${number}`, 'high');
  };

  // Step 2, shared by every path: one retry after 15 s unless the error names
  // an auth/ref problem.
  const push = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        deps.git(['push', 'origin', branch], { cwd: worktree });
        log(`pushed ${branch} to origin`, 'high');
        return null;
      } catch (e) {
        const reason = oneLine(errText(e));
        if (attempt === 1 && !AUTH_OR_REF_RE.test(reason)) { await deps.sleep(RETRY_WAIT_MS); continue; }
        log(`push of ${branch} to origin FAILED (${reason}); run proceeds local-only, no PR opened`, 'n/a');
        return reason;
      }
    }
  };

  // Step 3's body: session temp file keyed on this run id, first line re-read
  // and checked before anything consumes it.
  const writeBody = () => {
    const body = composePrEarlyBody({
      runId, specSummary: summary, target, nextStep, runDir,
      fixesLines: fixes.map((n) => `Fixes #${String(n).replace(/^#/, '')}`),
    });
    const bodyPath = deps.writeBodyFile(`pr-early-body-${runId}.md`, body);
    const expected = `<!-- claude-tweaks-run: ${runId} -->`;
    const first = String(deps.readFile(bodyPath)).split(/\r?\n/)[0];
    if (first !== expected) {
      throw new Error(`PR body first line is "${first}", expected "${expected}" — refusing to write a body naming another run (${bodyPath})`);
    }
    return bodyPath;
  };

  // Step 1: check GitHub before creating anything.
  const prs = listPrs();
  const open = prs.find((p) => p.state === 'OPEN');
  if (open) {
    log(`reusing open PR #${open.number} for ${branch}`, 'high');
    record(open.number, open.url);
    const failed = await push();
    if (failed !== null) return { outcome: 'push-failed', number: open.number, url: open.url, reason: failed };
    logStale('reused', open.number);
    return { outcome: 'reused', number: open.number, url: open.url };
  }

  const closed = prs.filter((p) => p.state === 'CLOSED');
  let reopenRejected = null;
  if (closed.length) {
    const adopted = adoptedPriorAttemptPr(deps.readDecisions ? deps.readDecisions() : '', branch);
    const pick = (adopted !== null && closed.find((p) => p.number === adopted)) || closed[0];
    try {
      deps.gh(['pr', 'reopen', String(pick.number), '--repo', repo]);
    } catch {
      // Spec: a rejected reopen (branch force-pushed out from under it, or
      // any state GitHub refuses) falls through to creation.
      reopenRejected = pick.number;
    }
    if (reopenRejected === null) {
      log(`reopened PR #${pick.number} for ${branch} (retry)`, 'high');
      // A reopened prior attempt's body names the old run: rebind it before
      // the push (#3887). Any failure here, a first-line mismatch included,
      // is a logged degrade, never a stop.
      if (adopted === pick.number) {
        try {
          deps.gh(['pr', 'edit', String(pick.number), '--repo', repo, '--body-file', writeBody()]);
          log(`rebound reopened PR #${pick.number} to run ${runId}`, 'high');
        } catch (e) {
          log(`rebind of reopened PR #${pick.number} failed (${oneLine(errText(e))}); phase-checklist updates will exit 4 until its body names run ${runId}`, 'n/a', 'SKIP');
        }
      }
      record(pick.number, pick.url);
      const failed = await push();
      if (failed !== null) return { outcome: 'push-failed', number: pick.number, url: pick.url, reason: failed };
      logStale('reused', pick.number);
      return { outcome: 'reopened', number: pick.number, url: pick.url };
    }
  }

  // No usable match (none, MERGED only, or a rejected reopen): create.
  if (reopenRejected !== null) log(`reopen of closed PR #${reopenRejected} for ${branch} was rejected; creating`, 'n/a');
  else log(`no existing PR for ${branch}; creating`, 'n/a');

  const pushFailed = await push();
  if (pushFailed !== null) return { outcome: 'push-failed', reason: pushFailed };

  const bodyPath = writeBody();
  const createArgs = ['pr', 'create', '--repo', repo, '--draft', '--base', base, '--head', branch,
    '--title', title, '--body-file', bodyPath];
  let created = null;
  let reason = null;
  for (let attempt = 1; attempt <= 2 && !created; attempt++) {
    if (attempt === 2) {
      if (TRANSIENT_RE.test(reason)) await deps.sleep(RETRY_WAIT_MS);
      // gh pr create is not idempotent: a "failed" attempt may have landed
      // with only its response lost, so look before creating again.
      let landed = null;
      try { landed = listPrs().find((p) => p.state === 'OPEN') || null; } catch { landed = null; }
      if (landed) { created = { number: landed.number, url: landed.url }; break; }
    }
    try {
      created = createdPr(deps.gh(createArgs));
    } catch (e) {
      reason = oneLine(errText(e));
    }
  }
  if (!created) {
    log(`gh pr create for ${branch} FAILED (${reason}); run proceeds local-only, no PR opened`, 'n/a');
    return { outcome: 'create-failed', reason };
  }
  log(`opened PR #${created.number} for ${branch}`, 'high');
  record(created.number, created.url);
  logStale('created', created.number);
  return { outcome: 'opened', number: created.number, url: created.url };
}

module.exports = { openPrEarly, adoptedPriorAttemptPr, AUTH_OR_REF_RE, TRANSIENT_RE };
