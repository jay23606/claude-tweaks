# Review — Cross-Lens Corroboration (`medium` tier only)

Read from `code-mode-steps.md`'s Cross-Lens Corroboration subsection only when the resolved `review-effort` tier (Step 2.5) is `medium`. Loaded by `/claude-tweaks:review` after Step 3's per-lens reproduction completes and before Step 3 Routing. A finding two *different* lenses report independently is evidence a reproduction pair of one lens cannot give; at `medium` there is no Step 3.5 debate, so this deterministic pass is the only place that evidence is used. No agent is dispatched — `_shared/multi-agent-coordination.md` Mode 1's "Cross-lens corroboration" subsection states the match rule.

This pass never runs at `low` or `high` (or above): at `low` the single-read rule in `step3-lens-dispatch.md` applies unchanged, and at `high` and above Step 3.5's Cross-Lens Debate (`step3-debate-and-refutation.md`) applies unchanged.

## Procedure

1. **Collect the input.** Gather every lens's `unconfirmed` findings after each pair's `categorise-reproduction` and the lens 3f vacuity bullet (`step3-lens-dispatch.md`) have run. A `confirmed` finding is never an input. Lens 3f vacuity findings downgraded to `unconfirmed` for missing execution evidence are **excluded** — only an executed run re-confirms those, and two lenses reading the same misleading comment are not independent evidence of a vacuity claim. Write the rest as one `{lens: [findings]}` object: resolve its path with one plain call — `node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" U=review-{ctx-id}-unconfirmed-by-lens.json` (`_shared/session-tmp-root.md`; `{ctx-id}` as defined in `step3-lens-dispatch.md`) — and `Write` the object to the printed `U` path (`{path-U}` below) with the `Write` tool.
2. **Run the match.** One plain call:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/review-coordination.js" corroborate-cross-lens {path-U}
   ```
   It prints `{ corroborated, unconfirmed }`. Each `corroborated` entry is a representative finding plus `lenses` (the lens names that reported it), `path`, `line`, `severity`, `severityContested` (only when the members' severities differ), and `members`.
3. **Promote.** Emit each `corroborated` entry as `confirmed`. It enters Step 3 Routing as an ordinary confirmed row — Category is the representative finding's lens, and `severityContested` is carried into the routing entry when set. Write to `decisions.md`, with `{lens list}` the comma-joined `lenses`:
   `AUTO {HH:MM:SS} — Cross-lens corroboration (medium tier): finding {path}:{line} reported independently by lenses {lens list}. Confirmed. Reversibility: high.`
4. **Stage the rest.** Each finding left in `unconfirmed` gets the STAGED line `step3-lens-dispatch.md`'s "only one agent's output" bullet deferred at `medium`: `not reproduced` (or the share-a-location line when it carries `nearLocation`), routing to the Wrap-Up Console's Low-confidence subsection as usual.
5. **Order.** Corroboration, then the deferred STAGED lines, then the post-fan-out untracked-file sweep (`step3-lens-dispatch.md`), then Step 3 Routing.

## Failure

A non-zero exit or unparseable output promotes nothing: every finding stays `unconfirmed`, the deferred STAGED lines are written as usual, and one line is logged:
`SKIP {HH:MM:SS} — Cross-lens corroboration (skipped): review-coordination.js exited {code} → findings stay unconfirmed. Reversibility: n/a.`
Exit 2 means malformed input — fix the `{path-U}` object rather than retrying unchanged.
