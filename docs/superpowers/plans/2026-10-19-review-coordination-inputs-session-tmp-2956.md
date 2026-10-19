# review lens dispatch: a worktree-isolated session cannot write the {ctx-dir}/lens-*.json findings files (#2956) Implementation Plan

**Goal:** Move `/claude-tweaks:review` Step 3's orchestrator-written coordination inputs (`lens-{LENS}-agent{A,B}.json`, `findings-by-lens.json`) out of `{ctx-dir}` into the session-scoped temp dir, so a worktree-isolated session is never refused writing them.

**Spec:** `.claude-tweaks/pipelines/2026-10-19T084628-record-2956/spec-2956/work/2956-spec.md` (materialized from GitHub issue #2956)

**Premise correction (logged to decisions.md):** under `--run`, `{ctx-dir}` is `{run}/review-ctx`, so its basename is the fixed literal `review-ctx` (`plugin/bin/lib/review-context/build.js` `resolveDir`) and cannot by itself keep two concurrent reviews apart. Define `{ctx-id}` as `{ctx-dir}`'s parent-directory basename joined to its own basename with `-` (e.g. `2026-10-19T084628-record-2956-review-ctx`, `spec-2956-review-ctx`, or `T-review-ctx-AbC123` for the mkdtemp form). The names still include the `{ctx-dir}` basename, as the AC requires.

---

### Task 1: Relocate the review coordination inputs to the session-scoped temp dir

**Files:**
- Modify: `plugin/skills/review/step3-lens-dispatch.md`
- Modify: `plugin/skills/review/step3-debate-and-refutation.md`
- Test: `tests/bin-lib/review-context/prose.test.js`

- [ ] **Step 1: Failing test** — append to `tests/bin-lib/review-context/prose.test.js` (read `step3-debate-and-refutation.md` alongside the existing `LENS_DISPATCH` read) assertions that:
  - neither step file contains `{ctx-dir}/lens-` or `{ctx-dir}/findings-by-lens.json` (no instruction writes these into `{ctx-dir}`);
  - `step3-lens-dispatch.md` names `session-tmp-resolve.js`, `_shared/session-tmp-root.md`, and the names `review-{ctx-id}-lens-{LENS}-agentA.json` / `review-{ctx-id}-lens-{LENS}-agentB.json`;
  - `step3-debate-and-refutation.md` names `session-tmp-resolve.js`, `_shared/session-tmp-root.md`, and `review-{ctx-id}-findings-by-lens.json`;
  - `step3-lens-dispatch.md` defines `{ctx-id}` in terms of the `{ctx-dir}` basename;
  - the Agent-scratch cleanup check's exclusion list no longer names `lens-*.json` or `findings-by-lens.json`.
  Run `node --test tests/bin-lib/review-context/prose.test.js` — the new assertions FAIL against current text.
- [ ] **Step 2: Implement** —
  - `step3-lens-dispatch.md` line ~70 (`{ctx-dir}` carry paragraph): stop claiming `lens-*.json`/`findings-by-lens.json` live in `{ctx-dir}`; define `{ctx-id}` (above) and say the orchestrator-written coordination inputs go to the session-scoped temp dir (`_shared/session-tmp-root.md`) under `review-{ctx-id}-…` names, because `{ctx-dir}` under `--run` sits in the main checkout where a worktree-isolated session is refused both `Write` and a heredoc redirect.
  - Reproduction dispatch (line ~88-90): resolve the pair's two paths with one plain call `node "${CLAUDE_PLUGIN_ROOT}/bin/session-tmp-resolve.js" A=review-{ctx-id}-lens-{LENS}-agentA.json B=review-{ctx-id}-lens-{LENS}-agentB.json` (prints `A="…"`/`B="…"`), `Write` each agent's `findings` array to the printed paths with the `Write` tool, then call `categorise-reproduction` with those two literal printed paths (no shell variable survives across calls).
  - `step3-debate-and-refutation.md` step 1: same treatment for `review-{ctx-id}-findings-by-lens.json` before `detect-overlap`; keep the "never a fixed shared `/tmp` name" rationale, now satisfied by the per-review name.
  - Agent-scratch cleanup check (line ~170): the `{ctx-dir}` exclusion list keeps only the pre/post-fan-out status snapshots (and listener snapshot) — drop `lens-*.json` and `findings-by-lens.json`.
  - No change to `plugin/bin/review-coordination.js` or `plugin/bin/build-review-context.js`.
- [ ] **Step 3: Run** `node --test tests/bin-lib/review-context/prose.test.js tests/multi-agent-coordination.test.js` — PASS. Also `wc -c` both step files and confirm `node --test tests/skill-size*.test.js` style size pins stay green (run any test file that names either step file: `git grep -l "step3-lens-dispatch\|step3-debate-and-refutation" tests`).
- [ ] **Step 4: Commit** — one commit, `Relocate review coordination inputs to the session temp dir — refs #2956`.

---

## Self-review

- **Spec coverage:** Deliverables 1-4 → Step 2 bullets; Deliverable 5 → Step 1. AC 1-3 → Step 1 assertions; AC 4 (red first) → Step 1 run; AC 5 → Step 2 last bullet; AC 6 (`npm test`) → Common Step 5.
- **Placeholders:** none.
