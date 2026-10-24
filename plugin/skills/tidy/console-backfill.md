# Tidy — `--console-backfill` Mode

Entered when `/claude-tweaks:tidy --console-backfill` is invoked — `SKILL.md`'s Input routes here in place of Steps 1-7.5. This mode never runs the backlog scan. It settles the unresolved items that closed and archived runs left in their Review Consoles (a can't-tell finding, a staged proposal, a digest-bound line nobody posted): every item ends as **filed** (a backlog record), **dropped** (the tiebreak refuted it), **digested** (a materiality-digest line) or **dismissed** (a byte-identical staged duplicate), and its console records which. **Human-present only** — a Routine and a pipeline never reach it; the summary in Step 3 is the one stop.

`bin/console-backfill.js` does the deterministic half and never calls a model or `gh`: `list` finds the work, `dispose` plans each batch, `apply` writes the outcomes back. This procedure does the rest — the tiebreak agents, the `gh` writes, the digest comment. It never writes `console.json` itself; `apply` is the only writer, and it re-checks at apply time that the run is closed.

## Step 1: Flags

A routing token that replaces a skill's phases owns every flag the skill accepts (`docs/skill-authoring.md`). `--console-backfill` replaces Steps 1-7.5, so:

- `--scope` and `--approve` with `--console-backfill`: rejected in combination — report both tokens, run neither.
- `--dry-run`: re-implemented — run `list --dry-run` (Step 3), print it, and stop. Nothing is written, dispatched or filed.

## Step 2: Main session only

The tiebreak agents are dispatched from this session. If the procedure is running inside a Task agent (no `Agent` tool), it stops and reports that `/claude-tweaks:tidy --console-backfill` must run in the main session. Never a nested or in-place substitute for the dispatch.

## Step 3: Summary first

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/console-backfill.js" list --dry-run` and print its output verbatim. It writes nothing and needs no checkout: the runs and items it counts, the deterministic digest/dismiss/file split, the live runs it skips, and the two numbers the question below needs (`tiebreak dispatches`, `records filed at most`). Exit 3 means the pipelines root is missing: report `HELD`, nothing was written.

With `--dry-run`, stop here. Otherwise ask one `AskUserQuestion`, `{a}` and `{N}` taken from the summary:

- `question`: `"The backfill will dispatch {a} tiebreak agents and may file up to {N} records. Proceed?"`
- `Proceed (Recommended)` — runs the batches below; each batch files records and posts to the shared digest issue.
- `Stop` — ends with nothing written; report `HELD`.

## Step 4: The integration tip and a scratch worktree

Resolve `{integration-branch}` by `_shared/integration-branch.md`'s Resolution ladder. Then, as separate plain calls, `git fetch origin {integration-branch}` and `git rev-parse origin/{integration-branch}`; the printed sha is `{mainSha}`. Create a scratch worktree per `_shared/scratch-worktree.md`'s `## 2. Creating it`, put it at that tip with `git checkout --detach {mainSha}` when the tool created it on a branch, and confirm `git rev-parse HEAD` prints `{mainSha}`. The tiebreak agents read its files, and `resolve-tiebreak` runs against it as `--root`.

Tear it down at the end on every exit path — a `console-backfill.js` failure, an agent failure, the loop ending — per `_shared/scratch-worktree.md`'s `## 6. Tearing down` (the detached HEAD equals `origin/{integration-branch}`, so its ancestry check passes). The worktree is never written to.

## Step 5: One batch

Repeat Steps 5-8 until Step 9's exit test fires. Keep a **failed set** for the run (item ids plus a reason); it starts empty.

1. **List again, before EVERY batch.** Resolve the paths once per batch with one plain call: `node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" WORKLIST=console-backfill-worklist.json BATCHLIST=console-backfill-batchlist.json EXISTING=console-backfill-existing.json COMMENTS=console-backfill-comments.json VERDICTS=console-backfill-verdicts.json PLAN=console-backfill-plan.json REFS=console-backfill-refs.json ENTRIES=console-backfill-entries.json OUTDIR=console-backfill-filings.d DIGESTDIR=console-backfill-digest.d` (`_shared/session-tmp-root.md`; use each path inside its printed quotes). Then `node "${CLAUDE_PLUGIN_ROOT}/bin/console-backfill.js" list --main-sha {mainSha} --out "{WORKLIST}"`. Every `itemHash` is fresh that way, including after an earlier batch persisted a split group. Exit 2 or 3: stop and report stderr.
2. **Cut the batch** — at most 24 items in list order, skipping the failed set — and read only that slice, never the whole work list:

   ```bash
   node -e "const fs=require('fs');const [src,dst,n,...skip]=process.argv.slice(1);const w=JSON.parse(fs.readFileSync(src,'utf8'));const sk=new Set(skip);let left=Number(n);let remaining=0;const view=[];w.runs=w.runs.map(r=>{remaining+=r.items.length;return {...r,items:r.items.filter(i=>{if(left<=0||sk.has(i.itemId))return false;left--;view.push(i.kind==='finding'?{itemId:i.itemId,kind:i.kind,finding:i.finding,claimText:i.claimText,context:i.context}:{itemId:i.itemId,kind:i.kind});return true;})};}).filter(r=>r.items.length);fs.writeFileSync(dst,JSON.stringify(w));console.log(JSON.stringify({remaining,batch:view},null,1))" "{WORKLIST}" "{BATCHLIST}" 24 {failed-itemIds}
   ```

   It writes `{BATCHLIST}` (the work list cut to the batch) and prints `remaining` (items in the fresh list) and `batch` (each finding with its `claimText` and `context`, every other item with just its id and kind). `{failed-itemIds}` is the failed set's ids, space-separated, or nothing.
3. **Fetch once per batch**, in this order, each redirected to its path:
   - `gh issue list --state all --json number,body --limit 2000 > "{EXISTING}"` (sized per `_shared/github-write-transport.md`'s "Sizing the list-then-filter window") — this run's earlier filings are in it, so a record filed in batch 1 dedups in batch 2.
   - the open digest issue: `gh issue list --label digest --state open --json number,url`. When one is open, `gh issue view {n} --json comments --jq .comments > "{COMMENTS}"` (pass it as `--digest-comments`; the comments carry their author association, so only trusted ones dedup, `_shared/materiality-floor.md`'s Dedup). When none is open, omit `--digest-comments`; the container is created in Step 7 only if the batch holds a digest line, per `_shared/materiality-floor.md`'s Container.

## Step 6: Tiebreak the batch's findings

The non-finding items (digest, dismiss, file) need no tiebreak. For each `finding` item in `batch`, dispatch one fresh agent in **waves of 8** — a wave in one batch, every agent returned before the next wave — following `review/step3-tiebreak.md`'s `## Dispatch` (its wait rules, foreground discipline and parallel-execution form). Model `Capable`: `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" capable` (no run directory exists).

Read `review/step3-tiebreak.md` and inline the fenced template under its `## Dispatch` verbatim into each `Task()` prompt, with these field values and nothing else changed:

- `Finding:` = the item's `claimText`, then a second line `Source (context only — judge just the finding at Location): {context}`.
- `Severity:` = `finding.reporterSeverity`.
- `Location:` = `{path}:{line}` from `finding`, or `{path}` when `line` is null.
- `Diff scope:` replaced by `Current code: {scratch worktree} at {mainSha} — decide whether this finding still holds today`.
- No `Positions:` lines — the stored finding carries none, whatever its `kind`.
- The bracketed READ-ONLY REVIEW line becomes `_shared/subagent-dispatch-core.md`'s `READ-ONLY REVIEW:` line, verbatim; `SCRATCH:` becomes a per-agent path from `session-tmp-resolve.js` (`SCRATCH=console-backfill-agent-{k}.d`); the model bracket line becomes the resolved profile.

A `BLOCKED`, `NEEDS_CONTEXT` or empty reply is re-dispatched once as a fresh agent, then passed as an empty reply — the resolver turns it into can't-tell, so a failed dispatch fails toward scrutiny, never toward a drop. Never log verdict lines into the closed run's `decisions.md`.

Resolve each reply: `Write` the finding as `{lens, path, line, claim: claimText, reporterSeverity, kind}` (all from the item's `finding` and `claimText`) and the agent's reply to two session-tmp paths (`F=console-backfill-tb-{k}.json R=console-backfill-tb-{k}-reply.txt`), then `node "${CLAUDE_PLUGIN_ROOT}/bin/review-coordination.js" resolve-tiebreak "{F}" "{R}" --root "{scratch worktree}"`. A non-zero exit gives that item no verdict: add it to the failed set (`resolve-tiebreak exited {code}`) and never invent one. Collect `{ "<itemId>": <its printed JSON> }` for the batch's resolved items into `{VERDICTS}`.

## Step 7: Dispose, then settle in this order

`node "${CLAUDE_PLUGIN_ROOT}/bin/console-backfill.js" dispose --work-list "{BATCHLIST}" --verdicts "{VERDICTS}" --existing "{EXISTING}" [--digest-comments "{COMMENTS}"] --limit 24 --out-dir "{OUTDIR}" > "{PLAN}"` (`--limit 24` is the CLI default, stated so the batch size is visible). Read `{PLAN}`: `dispositions`, `file` (each `{itemId, fingerprint, title, path}`), `reuse`, `digest` (`lines`, `duplicates`), `entries`, `awaitingVerdict`. Proposal bodies are in the files named by `path` and never in the plan. An item in `awaitingVerdict` joins the failed set (`no verdict`).

Per item, in this fixed order: dedup → file or digest → record ref → apply. The dedup is already in the plan (`reuse` is a filing that has a record, or repeats an earlier item of this batch; `digest.duplicates` is a line already posted). Collect each item's ref in `{REFS}`, a JSON object `{ "<itemId>": "<ref>" }`, as you go:

- **File.** For each `file[]` entry, read the proposal at `path`. Its header (the lines before the first blank line) carries `Title:`, `Type:`, `Labels:` and `Defer-reason:`. Run `wrap-up/refused-proposals.md`'s check on `Defer-reason:` first; a missing or invalid value files nothing and joins the failed set (`no-defer-reason`). Then create the record: the title is `file[].title`, single-quoted with each `'` inside it written `'\''` (`wrap-up/review-console.md` "On approval" step 7's quoting rule — a claim quoted in a title routinely carries backticks or `$(`); the body is the proposal's text after the header's blank line, written unchanged to a session-tmp file and passed with `--body-file`; the type per `_shared/work-record.md`'s Type row. Labels are exactly the `Labels:` header's, never more: `Labels: none`, or no `Labels:` line, is no label. A finding or shadow-dup proposal carries `needs:definition` from its own header. Never add or remove an `auto:*` or `bot:*` label on any record — they are granted by `/claude-tweaks:backlog refine`, never filed, and `dispose` already strips them from a Queue proposal's header. Transport per `_shared/github-write-transport.md`. The created record's ref is `#N`.
- **Reuse.** An entry with an existing record already has its `#N` in the plan. A same-batch `reuse` carrying `sameAs` takes its twin's `#N` — `settle` below does this from `{REFS}`.
- **Digest.** Create the container first when none is open (`_shared/materiality-floor.md`'s Container, label bootstrapped per `_shared/label-bootstrap.md`). Split the batch's `digest.lines` into comments of **under 60,000 characters** each — the one-comment-per-run rule of `_shared/materiality-floor.md` then holds per batch:

  ```bash
  node -e "const fs=require('fs');const [plan,dir,cap]=process.argv.slice(1);const p=JSON.parse(fs.readFileSync(plan,'utf8'));fs.mkdirSync(dir,{recursive:true});const dup=new Set(p.digest.duplicates);const byLine=new Map(p.dispositions.filter(d=>d.action==='digest'&&!dup.has(d.itemId)).map(d=>[d.digest.line,d.itemId]));const chunks=[];let cur=null;for(const line of p.digest.lines){if(!cur||cur.size+line.length+1>Number(cap)){cur={lines:[],itemIds:[],size:0};chunks.push(cur);}cur.lines.push(line);cur.itemIds.push(byLine.get(line));cur.size+=line.length+1;}const out=chunks.map((c,k)=>{const f=dir+'/digest-'+k+'.md';fs.writeFileSync(f,c.lines.join('\n')+'\n');return {path:f,itemIds:c.itemIds};});console.log(JSON.stringify(out,null,1))" "{PLAN}" "{DIGESTDIR}" 60000
  ```

  Post each printed `path` with `gh issue comment {n} --body-file "{path}"`; the comment's URL is the ref of every item in that chunk's `itemIds`. Each `digest.duplicates` item's ref is the digest issue's own URL. The `digest` issue is a container, not a record: no label or state change on it here, and its comment-cap rollover stays `digest-sweep.md`'s.
- **Failures.** A failed `gh` call leaves that item out of `{REFS}`. It stays unsettled, joins the failed set with the error, and the next run resumes it: a record created before a crash is found by its `work-fingerprint` in `{EXISTING}` and settles as a `reuse`, so nothing is filed twice.

Digest lines and filed records are the only `gh` writes; drops and dismissals carry their evidence in the plan's `ref` already.

## Step 8: Apply

Build the entries — the plan's `entries` with every null `ref` filled from `{REFS}`, a same-batch twin resolved, and any item still without a ref left out:

```bash
node -e "const fs=require('fs');const [plan,refs,dst]=process.argv.slice(1);const p=JSON.parse(fs.readFileSync(plan,'utf8'));const r=JSON.parse(fs.readFileSync(refs,'utf8'));for(const u of p.reuse)if(u.sameAs&&r[u.sameAs]&&!r[u.itemId])r[u.itemId]=r[u.sameAs];const entries=[];const unsettled=[];for(const e of p.entries){const ref=e.ref||r[e.itemId]||null;if(ref)entries.push({...e,ref});else unsettled.push(e.itemId);}fs.writeFileSync(dst,JSON.stringify(entries));console.log(JSON.stringify({entries:entries.length,unsettled}))" "{PLAN}" "{REFS}" "{ENTRIES}"
```

Every printed `unsettled` id joins the failed set. Then `node "${CLAUDE_PLUGIN_ROOT}/bin/console-backfill.js" apply --entries "{ENTRIES}"` and print the `applied` and `refused` counts. A refusal is reported with its reason, never retried blindly, and its item joins the failed set. `stale-hash` means re-list once, never force: a console changed between the list and the apply (an earlier entry of this batch persisted a split group), and the filing or digest line already landed. The next batch's Step 5 re-lists, and the item returns with a fresh hash: its record is found by fingerprint (a `reuse`, ref `#N`) or its line by the digest dedup, and it is judged again if it is a finding. Never force it, and an item refused `stale-hash` a second time is reported unsettled. Exit 3 from `apply` (a `console.json` unwritable) stops the loop.

## Step 9: Loop and exit test

`remaining` from Step 5's cut is the test. `remaining` of 0: the work list is empty — done. A non-empty `remaining` with an empty `batch`: every remaining item failed this run — stop. Otherwise start the next batch at Step 5.

## Step 10: Report

Run `list --dry-run` once more for the live-runs line, tear down the scratch worktree (Step 4), then report, each as paste-ready lines the reader can follow:

- every filed record (`#N`, with the item it settled);
- every drop, with its evidence (`{path}:{line} "{quote}"`);
- every digest comment URL and the count digested (a run that digested none states `0`, `_shared/materiality-floor.md`'s Digest URL and count surfacing);
- every unsettled item, with its reason and the re-run `/claude-tweaks:tidy --console-backfill`;
- the live runs skipped (their consoles are untouched).

Close with the outcome word (`driver-skill-outcome-taxonomy`): `HELD` when a gate fired before any write (Step 3's `Stop` or an exit 3 on the first `list`), `failed` when a write was attempted and nothing landed, `PARTIAL` when something landed and items remain, `done` when the work list is empty.
