# Open Items — #3341 check-artifact-overwrite: pass a content-preserving step-markup reformat

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | SDD ruling — implementer runs focused suites only (lib, CLI, namespacing conformance), not full `npm test`; /build Common Step 5 runs the full suite centrally: ratify or reverse at the Review Console (staged/sdd-ruling-1.md) | open | — |
| 2 | build | isStepMarkupReformat returns true for a hunk deleting only blank lines (removed/added both empty after filtering) — harmless, but the comment "A deletion-only hunk never qualifies" overstates it; a removed.length===0 guard would tighten it | deferred | Task review Minor (SDD) — no content lost; triage at wrap-up |
| 3 | build | parseHunks skips any hunk line starting with ---/+++ (pre-existing), so a deleted YAML `---` delimiter is invisible; the new step-markup test widens the exposure — a reformat hunk that also drops a frontmatter delimiter would clear | deferred | Task review Minor (SDD) — pre-existing parser edge; follow-up candidate at wrap-up |
| 4 | build | Live replay test early-returns when 80e3dad2d is absent (shallow clone) and checks only the head commit, not d81250829 — same precedent as the existing AC1 test | deferred | Task review Minor (SDD) — matches existing test precedent |
