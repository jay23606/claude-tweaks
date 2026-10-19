---
files:
  - plugin/skills/build/plan-authoring-checks.md
---

# Sweep Every Phrasing of a Retired Mechanism

**Persona:** A `/claude-tweaks:build` session, or the maintainer reviewing its plan, authoring a plan that deletes or retires a named mechanism (a constant, an option, a CLI, a gate).
**Goal:** Leave no shipped skill, doc, journey, or test comment still citing the retired mechanism, so the whole-branch review isn't the first line of defence.
**Entry point:** `/claude-tweaks:build` Spec Step 3 (or Design Step 3), while running the checks in `plugin/skills/build/plan-authoring-checks.md` before the plan is finalized.
**Success state:** The plan carries a sweep task. Its verification grep has one `-e` per phrasing, and its file list is exactly the set of non-history paths that grep returned.

## Steps

### 1. Recognize the trigger
- **URL:** the spec's `## Deliverables`, and the **Retirement-sweep check:** paragraph in `plan-authoring-checks.md`.
- **Action:** Notice that a deliverable deletes or retires a named mechanism.
- **Should feel:** Like a known trap, flagged before any file list is written.
- **Should understand:**
  - The spec's own list of sites to rewrite holds only the sites its author remembered, not every site that still cites the mechanism.
- **Red flags:**
  - A plan whose rewrite list is copied straight from the spec.

### 2. Enumerate the phrasings
- **URL:** the mechanism's own source: its definition, its file, its option, its value, and the issue that introduced it.
- **Action:** Write down each phrasing:
  - the identifier
  - the file path
  - the option literal
  - the numeric value as prose (for example, "40 KB ceiling")
  - the issue number used as a label (for example, "#724 budget")
- **Should feel:** Mechanical. Each phrasing comes from a fact about the mechanism, not a guess about how prose describes it.
- **Should understand:**
  - #3311's missed sites used these exact shapes: "warning tier", "40 KB ceiling", "#724 budget", "five bloat signals", and `ceiling: Infinity`.
- **Red flags:**
  - Only the identifier is searched.

### 3. Derive the file list from the grep
- **URL:** the repo itself, `git grep -n -i -e '{phrasing}' …`, one `-e` per phrasing, over every non-history path.
- **Action:** Make the grep the sweep task's verification step. The task's file list is that grep's output. Append-only history such as the changelog stays untouched.
- **Should feel:** Complete. The list is bounded by what the repo actually says.
- **Should understand:**
  - This is the plan-time form of the "Deleted-rule citation sweep" and "Grep retired term repo-wide" rules. The grep that re-verifies the sweep is the same one that produced the list.
- **Red flags:**
  - A sweep task whose verification grep names fewer phrasings than step 2 listed.
  - A rewritten changelog entry.

## Origin
- Created during build of #3462, a reflect finding from #3311 (squash `f49277005`). #3311's plan took its rewrite list from the spec's three named files. About 40 further sites still cited the deleted mechanisms, and only the whole-branch review caught them (two Important findings). Closing them took a fix wave, two residual sweeps, and a scoped re-review.
- Pinned by `tests/plan-authoring-retirement-sweep-prose.test.js`.
- Related: `derive-a-reader-inventory-from-read-call-sites-3397.md` and `merge-small-adjacent-tasks-at-plan-time-3379.md`, which are also plan-authoring checks that `/claude-tweaks:build` applies before a plan is finalized.
