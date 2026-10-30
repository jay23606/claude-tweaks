---
files:
  - plugin/bin/review-routing-line.js
  - plugin/bin/lib/log-decision/review-routing.js
  - plugin/bin/log-decision.js
  - plugin/skills/review/step3-routing.md
  - plugin/skills/release/SKILL.md
  - tests/review-routing-line-prose-conformance.test.js
---

# Route a Review Finding the Release Gate Can See

**Persona:** A review agent in `/claude-tweaks:review` Step 3 Routing, inside a `/claude-tweaks:flow` run or `/claude-tweaks:release`'s whole-branch review. A lens has just confirmed a high-severity security finding in `app/routes/posts.$postId.tsx:12`, and the agent must log where it went.
**Goal:** Log one `## /review` line that `/claude-tweaks:release` Step 3's token match classifies correctly, and that points at the right file, without composing the wording by hand.
**Entry point:** `review/step3-routing.md`'s AUTO / STAGED / KEPT-PROMPT bullets, whose `Log:` field is a `review-routing-line.js` command.
**Success state:** `decisions.md` holds `STAGED … — Step 3 Routing: high-severity finding security at app/routes/posts.$postId.tsx:12. Stage path: staged/review-3.patch. Reversibility: high.` The release gate reads it as `review: blocking`, and the agent never typed a severity token, a step prefix or a quote escape beyond `'\''`.

## Steps

### 1. Pick the route — the ceiling table
- **URL:** `plugin/skills/review/step3-routing.md`'s ceiling-keyed routing table
- **Action:** The agent reads the finding's severity against the resolved `review-auto-apply-ceiling`. High routes STAGED at every ceiling; critical always routes KEPT-PROMPT; low/medium route AUTO or STAGED by ceiling.
- **Should feel:** Decided for it. The table names one route per severity and ceiling.
- **Should understand:** The route picks the CLI's `--route` value. KEPT-PROMPT still stages a patch, but its log line never names one.
- **Red flags:** The bullet invites `--stage-path` on a KEPT-PROMPT line, or a high finding looks routable to AUTO.

### 2. Run the cited command — `review-routing-line.js`
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/review-routing-line.js" --run "$PIPELINE_RUN_DIR" --route staged --severity high --category 'security' --at 'app/routes/posts.$postId.tsx:12' --stage-path staged/review-3.patch`
- **Action:** The agent fills the placeholders and runs the command, single-quoting `--category` and `--at` (a `'` inside a value is written `'\''`). The CLI composes the text and appends it under `## /review` with step `Step 3 Routing`, echoing the line.
- **Should feel:** Like filling a form. Severity case (`High`) doesn't matter, and the token order is not the agent's job.
- **Should understand:** Exit 2 means the call was refused and nothing was written: a route/severity pairing the table never produces, a flag that doesn't belong to the route (`--commit` on staged), a non-hex `--commit`, a malformed `--stage-path`, or a `--category`/`--at` that itself carries `severity finding` / `critical finding`. Exit 3 means the run dir is missing or not anchored under the main checkout.
- **Red flags:** The `$postId` segment vanishes from the logged path (the value was double-quoted), or a hand-typed `{severity}-severity {category} finding` reaches `decisions.md`.

### 3. A hand-typed prefix is refused — `log-decision.js`
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "{run-dir}" --status STAGED --step "Step 3 Routing" --text "Step 3 Routing: …"`
- **Action:** An agent that bypasses the composer and copies an old template's `Step 3 Routing:` into `--text` gets exit 2, with stderr naming both the `--step` and the `--text` values.
- **Should feel:** Caught before damage — the doubled `Step 3 Routing: Step 3 Routing:` line never lands.
- **Should understand:** `log-decision.js` writes `{step}: ` itself, so a text that begins with its own `--step` + `:` is always a mistake. The same refusal covers `--text-file` and every `--entries` element.
- **Red flags:** The doubled prefix is written, or the refusal fires on a text that merely mentions the step without the colon prefix.

### 4. The release gate reads it — `/claude-tweaks:release` Step 3
- **URL:** `plugin/skills/release/SKILL.md` Step 3's verdict table
- **Action:** **The release agent** reads the `## /review` lines after its marker and classifies on the literal tokens `critical finding` / `high-severity finding`.
- **Should feel:** Trustworthy. A staged high or critical finding always blocks.
- **Should understand:** The composer is what guarantees the token's presence and order; `tests/bin-lib/log-decision/review-routing.test.js` reads the tokens from this table, so a reworded gate fails there.
- **Red flags:** A staged high finding classifies as `review: findings` or `review: clean`.

## Origin
- Created during build of #4488 (review routing line composer + `--step` prefix refusal)
- Steps 1-4 built in this session
- Related: #4481 (the run whose hand-typed lines carried the doubled prefix and the mis-ordered token), #3792 (git/user text never double-quoted)
