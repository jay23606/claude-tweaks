# Open Items — Digest dedup trusts a materiality-fingerprint marker from any commenter

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | trusted element without a string body pushes undefined into trustedMaterialityTexts().texts (materiality-digest.js) — harmless, parseMaterialityFingerprints tolerates it | deferred | — |
| 2 | build | digest-sweep.md one line is 105 chars (cosmetic) | deferred | — |
| 3 | build | digest-sweep.md inlined jq keys on authorAssociation (gh transport) only; a gh-absent MCP run sees author_association and finds no trusted comments — fails closed; same limit as _shared/pr-run-comments.md's own jq | deferred | — |
| 4 | build | SDD ruling — bare-string array element gets a distinct skip note rather than a thrown TypeError: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 5 | build | SDD ruling — bot/app digest writers going write-only logged with no change (consistent with Trusted authors' bot exclusion): ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
| 6 | review/3a | digest-sweep.md note-filter snippet lacked the marker select its prose requires (3a pair, low) | fixed | dd6685686 |
| 7 | review/3a,3b | Low-confidence, single-agent: string input trusted in trustedMaterialityTexts (local-files single-writer by design); isMaterialityDuplicate returns no skip notes (prose names trustedMaterialityTexts().skipped); step3-routing.md cites the Dedup section for the object shape | observation | Read directly: each is the documented contract, not a defect |
| 8 | review/hindsight | docs/skill-authoring.md says a new marker reader adds its pin to comment-trust-conformance.test.js; the #3766 readers are pinned in materiality-floor-conformance.test.js (jq byte-checked against comment-trust.js) | accepted | The pin exists and is discriminating on the jq text; splitting the digest prose pins across two suites adds no coverage |
