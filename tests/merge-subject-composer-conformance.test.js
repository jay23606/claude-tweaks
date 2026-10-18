// tests/merge-subject-composer-conformance.test.js — pins #2251's merge-site contract:
// every merge site sources its subject/body from bin/compose-subject.js (AC 5), the two
// pr-first sites squash (AC 1), and pr-first-merge.md stays net-small (AC 6). Frozen
// pre-change excerpts prove each pattern can go red (skill-prose-conformance-tests, IL-105).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { readText } = require('./helpers/read-skill');

const ROOT = path.join(__dirname, '..');
const read = (rel) => readText(path.join(ROOT, rel));

const PR_FIRST = 'plugin/skills/_shared/pr-first-merge.md';
const LOCAL_SITES = [
  'plugin/skills/_shared/local-merge-auto-finish.md',
  'plugin/skills/wrap-up/auto-merge-short-circuit.md',
  'plugin/skills/dispatch/settle-and-merge.md',
  'plugin/skills/flow/worktree-merge.md',
];

// Frozen pre-change excerpts (byte-for-byte from the pre-#2251 files).
const PRE_PR_FIRST_SITE = `gh pr merge {pr-number} --repo {owner}/{repo} --auto --merge \\
  -t "[{tag}] {one-line summary}" \\
  -b "$(printf 'Fixes #%s\\n' {issue-list})"`;
const PRE_LOCAL_SITE = `git merge --no-ff {branch} -m "[auto-merge] {one-line summary}

Fixes #{issue}
Fixes #{second-issue}"`;
// The pre-#3347 pr-first Step 3 fence (eval-composed via --shell), byte-for-byte from 294eac138.
const PRE_3347_PR_FIRST_FENCE = `SUBJECT_EXPORTS=$(node "\${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue-list} --tag {tag} --pr {pr-number} --shell) || exit 1
eval "$SUBJECT_EXPORTS"
gh pr merge {pr-number} --repo {owner}/{repo} --auto --squash \\
  -t "$SUBJECT_TITLE" -b "$SUBJECT_BODY"`;
const PRE_WORKTREE_MERGE_SITE = `   git merge --no-ff {branch} -m "Merge {branch} — specs {list}

   Fixes #{issue}
   Fixes #{second-issue}"`;
// The pre-#3298 composer call — no changed-paths source (neither --range nor --pr).
const PRE_RANGELESS_CALL = `SUBJECT_EXPORTS=$(node "\${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} --tag auto-finish --shell) || exit 1
   eval "$SUBJECT_EXPORTS"`;
// The pre-#3298 worktree-merge.md call (two-issue form, no changed-paths source).
const PRE_WORKTREE_RANGELESS_CALL = `   SUBJECT_EXPORTS=$(node "\${CLAUDE_PLUGIN_ROOT}/bin/compose-subject.js" {issue} {second-issue} --shell) || exit 1
   eval "$SUBJECT_EXPORTS"`;

// local-merge fences read the changed paths from a local `--range {base}...{head}` diff;
// pr-first fences read them from the PR itself via `--pr {pr-number}` (#3298 final review).
const LOCAL_COMPOSER_CALL = /SUBJECT_EXPORTS=\$\(node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/compose-subject\.js" [^\n]*--range \{[a-z-]+\}\.\.\.\{[a-z-]+\} --shell\) \|\| exit 1\n[ \t]*eval "\$SUBJECT_EXPORTS"/;
const PR_FIRST_COMPOSER_CALL = /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/compose-subject\.js" [^\n]*--pr \{pr-number\} --title-out "\{title-file\}" --body-out "\{body-file\}"/;
const LOCAL_MERGE_FORM = /git merge --no-ff \{[a-z-]+\} -m "\$SUBJECT_TITLE\n\n\$SUBJECT_BODY"/;
const STALE_LOCAL_FORM = /git merge --no-ff \{[a-z-]+\} -m "(\[|Merge \{branch\})/;
const STALE_PR_FIRST_FORM = /gh pr merge \{pr-number\}[^\n]*--merge \\/;

test('pr-first-merge.md: both gh pr merge sites squash and take the composer output', () => {
  const text = read(PR_FIRST);
  const squashSites = text.match(/gh pr merge \{pr-number\} --repo \{owner\}\/\{repo\} (--auto )?--squash -t "\$\(cat "\{title-file\}"\)" --body-file "\{body-file\}"/g) || [];
  assert.equal(squashSites.length, 2, 'expected exactly two squash merge sites');
  assert.match(text, PR_FIRST_COMPOSER_CALL);
  assert.doesNotMatch(text, /--range \{/, 'pr-first fences carry no --range');
  // F1: the degrade fence (the `--squash` site under `merge-verification: off`) no longer relies
  // on the first fence's shell state surviving into its own, separate Bash call — it guards its
  // own composer call, same as the first fence.
  const composerCalls = text.match(new RegExp(PR_FIRST_COMPOSER_CALL.source, 'g')) || [];
  assert.equal(composerCalls.length, 2, 'expected both squash sites to run their own guarded composer call');
  assert.doesNotMatch(text, STALE_PR_FIRST_FORM);
  assert.doesNotMatch(text, /-t "\[\{tag\}\] \{one-line summary\}"/);
  // go-red proof
  assert.match(PRE_PR_FIRST_SITE, STALE_PR_FIRST_FORM);
  assert.doesNotMatch(PRE_PR_FIRST_SITE, PR_FIRST_COMPOSER_CALL);
});

for (const rel of LOCAL_SITES) {
  test(`${path.basename(rel)}: the --no-ff merge sources -m from the composer`, () => {
    const text = read(rel);
    assert.match(text, LOCAL_COMPOSER_CALL, 'composer eval line present');
    assert.match(text, LOCAL_MERGE_FORM, 'merge takes $SUBJECT_TITLE / $SUBJECT_BODY');
    assert.doesNotMatch(text, STALE_LOCAL_FORM, 'no free-form -m subject remains');
  });
}

// Fenced ```…``` blocks, each as an array of its lines (delimiter lines excluded).
function fencedBlocks(text) {
  const blocks = [];
  let cur = null;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      if (cur) { blocks.push(cur); cur = null; } else { cur = []; }
    } else if (cur) {
      cur.push(line);
    }
  }
  return blocks;
}

// The fences that eval-compose compose-subject --shell output into a gh pr merge call.
function evalComposedMergeFences(blocks) {
  return blocks.filter((lines) => {
    const body = lines.join('\n');
    return /gh pr merge/.test(body)
      && /compose-subject\.js[^\n]*--shell|eval "\$SUBJECT_EXPORTS"|"\$SUBJECT_(TITLE|BODY)"/.test(body);
  });
}

function skillMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return skillMarkdown(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

test('AC2.1/AC2.2: no gh pr merge fence in plugin/skills/** eval-composes compose-subject --shell output', () => {
  const offenders = [];
  let composing = 0;
  for (const file of skillMarkdown(path.join(ROOT, 'plugin', 'skills'))) {
    const blocks = fencedBlocks(readText(file));
    if (evalComposedMergeFences(blocks).length > 0) offenders.push(path.relative(ROOT, file));
    composing += blocks.filter((b) => /gh pr merge/.test(b.join('\n')) && /compose-subject\.js/.test(b.join('\n'))).length;
  }
  assert.deepEqual(offenders, [], 'gh pr merge fences that eval compose-subject --shell output');
  assert.ok(composing >= 2, `expected >= 2 gh pr merge fences that run compose-subject.js, found ${composing}`);
  // go-red proof: the same function flags the frozen pre-#3347 fence
  assert.equal(evalComposedMergeFences([PRE_3347_PR_FIRST_FENCE.split('\n')]).length, 1);
});

test('go-red proof: the frozen pre-change local-merge forms match the stale pattern and not the new one', () => {
  for (const pre of [PRE_LOCAL_SITE, PRE_WORKTREE_MERGE_SITE]) {
    assert.match(pre, STALE_LOCAL_FORM);
    assert.doesNotMatch(pre, LOCAL_MERGE_FORM);
    assert.doesNotMatch(pre, LOCAL_COMPOSER_CALL);
  }
  assert.doesNotMatch(PRE_RANGELESS_CALL, LOCAL_COMPOSER_CALL);
  assert.doesNotMatch(PRE_RANGELESS_CALL, PR_FIRST_COMPOSER_CALL);
  assert.doesNotMatch(PRE_WORKTREE_RANGELESS_CALL, LOCAL_COMPOSER_CALL);
  assert.doesNotMatch(PRE_WORKTREE_RANGELESS_CALL, PR_FIRST_COMPOSER_CALL);
});
