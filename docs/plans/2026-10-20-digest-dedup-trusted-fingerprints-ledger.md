# Open Items — Digest dedup trusts a materiality-fingerprint marker from any commenter

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | trusted element without a string body pushes undefined into trustedMaterialityTexts().texts (materiality-digest.js) — harmless, parseMaterialityFingerprints tolerates it | deferred | — |
| 2 | build | digest-sweep.md one line is 105 chars (cosmetic) | deferred | — |
| 3 | build | digest-sweep.md inlined jq keys on authorAssociation (gh transport) only; a gh-absent MCP run sees author_association and finds no trusted comments — fails closed; same limit as _shared/pr-run-comments.md's own jq | deferred | — |
| 4 | build | SDD ruling — bare-string array element gets a distinct skip note rather than a thrown TypeError: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 5 | build | SDD ruling — bot/app digest writers going write-only logged with no change (consistent with Trusted authors' bot exclusion): ratify or reverse at the Review Console (staged/sdd-ruling-2.md) | open | — |
