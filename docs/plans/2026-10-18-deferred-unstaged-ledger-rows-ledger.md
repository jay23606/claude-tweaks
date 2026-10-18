# Open Items — wrap-up: the ledger bulk-resolve fast path accepts deferred rows with no staged proposal

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD Task 1 minor: ledger-format `→ backlog` producers (ledgerNarrowing / ledgerRouteRemainder / Phase 3 Keep) wrote no staged path or record reference | fixed | 1139338e2 (final-review M1: each producer now names `staged/ledger-record-{slug}.md` in Resolution) |
| 2 | build | SDD Task 1 minor: the pack.js comment above the #3327 constants cites "_shared/ledger-format.md's `deferred` definition" loosely (the wording sits in the Resolution-text requirements paragraph) | deferred | Origin: SDD Task 1 review; files: plugin/bin/lib/wrap-up/pack.js. Final whole-branch review triage: leave. Trigger: next edit of that comment |
| 3 | build | SDD Task 1 minor: no test pins a pipe character inside a deferred row's Resolution (cells.slice(4).join handles it) | deferred | Origin: SDD Task 1 review; files: tests/bin-lib/wrap-up/pack.test.js. Final whole-branch review triage: leave. Trigger: any change to parseLedger's cell split |
| 4 | build | SDD Task 2 minor: ledger-format Terminal / Non-terminal status lines did not name the incomplete-deferral exception | fixed | 1139338e2 (final-review I3) |
| 5 | build | SDD Task 2 minor: incomplete-deferral settling-write parenthetical omitted `fixed` / Acknowledge | fixed | 1139338e2 (now an illustrative "e.g." list) |
| 6 | build | SDD Task 2 minor: Phase 3 Defer/Keep branch text said only "update status to deferred" | fixed | 1139338e2 (final-review M1) |
| 7 | build | SDD ruling — incomplete deferral defined once in ledger-format's Resolution-text requirements (resolve gate treats it as `open`; settling write is its first complete terminal write); nothing-left-behind cites it: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 8 | build | SDD ruling — record reference = issue/PR URL path or a `#N` that is not the run's own record and not `item`-prefixed: ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 9 | build | SDD ruling — ledgerProbe always file-qualifies deferredUnstagedItems as `{file}#{item}`; parseLedger keeps bare ids: ratify or reverse at the Review Console (staged/sdd-ruling-3.md) | open | — |
| 10 | build | SDD parked — record-reference regex edges: `item (#6)` / `items #4` count as references; an own-record URL (`/issues/1535`) counts though bare `#1535` does not; a URL fragment `…#12` counts | observation | Ruling recorded by the SDD controller: code stands — exclusion scoped to bare `#N` and item-prefixed tokens; cost if wrong: a rare row is treated terminal |
| 11 | build | SDD parked — the empty-Resolution test discriminates only the id qualification (empty-cell flagging pre-dated the fix wave) | observation | Ruling recorded by the SDD controller: keep — it pins empty-cell flagging going forward; no cost |
