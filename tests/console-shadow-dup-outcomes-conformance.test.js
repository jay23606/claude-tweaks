// tests/console-shadow-dup-outcomes-conformance.test.js — #3946: the console prose
// registers the `Dismissed duplicates` section (review-console-section-addition's
// sites 7, 9, 10 and 11; site 8's heading in console-template.md is pinned by
// reflect-wrap-up-insights-staging-conformance.test.js, which reads SECTIONS).
//
// Reading the live prose is the declared carve-out here (skill-prose-conformance-tests,
// [IL-80]): these files restate a structure that lives in plugin/bin/lib/console/resolve.js
// (the section name and its resolution), so updating them IS the response to a change there.
// The section name and the `dismissed` resolution are read from that module, never hand-typed.
//
// Each of the four `assert*` helpers is the single assertion both the live-file test and its
// go-red control call: the control doctors the live text in memory (assert.notEqual guards a
// replace that matched nothing) and expects the same helper to throw with that assertion's own
// message. Later tasks in #3946 append assertions to this file using these helpers.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { readText } = require('./helpers/read-skill');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => readText(path.join(ROOT, ...p));
const { SECTIONS, SECTION_STANCES } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'console', 'resolve.js'));

const NAME = SECTIONS.DISMISSED;
const RESOLUTION = SECTION_STANCES[NAME].resolution;

const APPENDIX = read('plugin', 'skills', 'wrap-up', 'review-console-appendix.md');
const INTERACTIVE = read('plugin', 'skills', 'wrap-up', 'review-console-interactive.md');
const MULTISPEC_TEMPLATE = read('plugin', 'skills', 'flow', 'multispec-console-template.md');
const WRAPUP_SKILL = read('plugin', 'skills', 'wrap-up', 'SKILL.md');

// --- helpers -------------------------------------------------------------------

// The Resolution-to-step mapping's bullet for `resolution`, from its `- \`resolution\`` opener
// to the next top-level bullet. Throws (with its own message) when the section or bullet is gone.
function mappingBullet(appendixText, resolution) {
  const start = appendixText.indexOf('### Resolution-to-step mapping');
  assert.notEqual(start, -1, 'the appendix has no "### Resolution-to-step mapping" section');
  const end = appendixText.indexOf('\n## ', start);
  assert.notEqual(end, -1, 'the Resolution-to-step mapping has no following ## section to bound it');
  const lines = appendixText.slice(start, end).split('\n');
  const opener = `- \`${resolution}\``;
  const first = lines.findIndex((l) => l.startsWith(opener));
  assert.notEqual(first, -1, `the Resolution-to-step mapping has no ${opener} bullet`);
  let last = first + 1;
  while (last < lines.length && !lines[last].startsWith('- ') && lines[last].trim() !== '') last += 1;
  return lines.slice(first, last).join(' ').replace(/\s+/g, ' ');
}

// The facts the `dismissed` bullet owes, as [label, pattern]. Non-global on purpose.
const DISMISSED_FACTS = [
  ['executes nothing', /^- `dismissed` — execute \*\*nothing\*\*/],
  ['names the section', new RegExp(`\\*\\*${NAME}\\*\\*`)],
  ['a .shadow-dup copy', /`\.shadow-dup` copy/],
  ['byte-identical to its anchor', /byte-identical to its anchor \(`shadow-dup-duplicate`\)/],
  ['the anchor is its own item', /anchor is its own item/],
  ['the copy stays in staged/', /copy stays in `staged\/`/],
];

function missingDismissedFacts(bullet) {
  return DISMISSED_FACTS.filter(([, pattern]) => !pattern.test(bullet)).map(([label]) => label);
}

function assertDismissedRouted(appendixText) {
  const bullet = mappingBullet(appendixText, RESOLUTION);
  assert.deepEqual(missingDismissedFacts(bullet), [], `the \`${RESOLUTION}\` bullet lost a fact`);
}

// The Numbering rules' first bullet (the named batch sections), as one line.
function namedBatchBullet(interactiveText) {
  const line = interactiveText.split('\n').find((l) => l.startsWith("- The console's **named batch sections**"));
  assert.ok(line, "the Numbering rules have no \"- The console's **named batch sections**\" bullet");
  return line;
}

function assertInBatchList(interactiveText, name) {
  const line = namedBatchBullet(interactiveText);
  assert.ok(
    line.includes(`${SECTIONS.PENDING}, ${name}, ${SECTIONS.LOW},`),
    `the named-batch-sections list does not put ${name} between ${SECTIONS.PENDING} and ${SECTIONS.LOW}`,
  );
  const anchor = line.indexOf('render only when non-empty');
  assert.notEqual(anchor, -1, 'the named-batch-sections bullet has no "render only when non-empty" parenthetical');
  const open = line.lastIndexOf('(', anchor);
  const close = line.indexOf(')', anchor);
  assert.ok(open !== -1 && close !== -1, 'the "render only when non-empty" clause is not inside a parenthetical');
  assert.ok(
    line.slice(open, close).includes(name),
    `the "render only when non-empty" parenthetical does not name ${name}`,
  );
}

// A `#### {name} (` heading must exist once, between Pending review and Low-confidence findings.
function assertHeading(templateText, name) {
  const head = (n) => `\n#### ${n} (`;
  const idx = templateText.indexOf(head(name));
  assert.notEqual(idx, -1, `no "#### ${name} (" heading`);
  assert.equal(templateText.indexOf(head(name), idx + 1), -1, `more than one "#### ${name} (" heading`);
  const pending = templateText.indexOf(head(SECTIONS.PENDING));
  const low = templateText.indexOf(head(SECTIONS.LOW));
  assert.ok(pending !== -1 && low !== -1, 'the Pending review or Low-confidence findings heading is missing — the order check has no anchors');
  assert.ok(pending < idx && idx < low, `"#### ${name} (" is not between ${SECTIONS.PENDING} and ${SECTIONS.LOW}`);
}

// wrap-up/SKILL.md's Review Console paragraph: the parenthesized `/`-separated section list.
function assertInSkillList(skillText, name) {
  const marker = 'the named sections `review-console.md` heads (';
  const start = skillText.indexOf(marker);
  assert.notEqual(start, -1, 'wrap-up/SKILL.md has no "the named sections `review-console.md` heads (" list');
  const listStart = start + marker.length;
  const listEnd = skillText.indexOf(')', listStart);
  assert.notEqual(listEnd, -1, 'the Review Console section list is never closed');
  assert.ok(
    skillText.slice(listStart, listEnd).includes(`${SECTIONS.PENDING} / ${name} / ${SECTIONS.LOW}`),
    `the Review Console section list does not put ${name} between ${SECTIONS.PENDING} and ${SECTIONS.LOW}`,
  );
}

// multispec-review-console.md: both enumerations of the prose-aggregated sections (the step-2 read
// and the "Canonical render order") put `name` right after Pending review.
function assertInMultispecOrder(consoleText, name) {
  const adjacent = `${SECTIONS.PENDING}, ${name}, ${SECTIONS.LOW}`;
  const count = consoleText.split(adjacent).length - 1;
  assert.equal(count, 2, `multispec-review-console.md carries "${adjacent}" ${count} times, expected 2 (the step-2 read list and the Canonical render order)`);
}

// Doctor `text` by replacing exactly one match; the notEqual guard stops a no-op replace passing.
function doctor(text, pattern, replacement) {
  const out = text.replace(pattern, replacement);
  assert.notEqual(out, text, `control did not change the text: ${pattern}`);
  return out;
}

// --- appendix: Resolution-to-step mapping -----------------------------------------

test('the resolution read from code is `dismissed` (the bullet below is keyed on it)', () => {
  assert.equal(RESOLUTION, 'dismissed');
  assert.equal(NAME, 'Dismissed duplicates');
});

test('dismissed routes to execute-nothing in the appendix mapping', () => {
  assertDismissedRouted(APPENDIX);
});

test('control: deleting the dismissed bullet fails assertDismissedRouted', () => {
  const lines = APPENDIX.split('\n');
  const first = lines.findIndex((l) => l.startsWith(`- \`${RESOLUTION}\``));
  assert.notEqual(first, -1);
  let last = first + 1;
  while (last < lines.length && !lines[last].startsWith('- ') && lines[last].trim() !== '') last += 1;
  const mutated = [...lines.slice(0, first), ...lines.slice(last)].join('\n');
  assert.notEqual(mutated, APPENDIX);
  assert.throws(() => assertDismissedRouted(mutated), { message: /has no - `dismissed` bullet/ });
});

test('control: each fact of the dismissed bullet is individually load-bearing', () => {
  const bullet = mappingBullet(APPENDIX, RESOLUTION);
  assert.deepEqual(missingDismissedFacts(bullet), []);
  for (const [label, pattern] of DISMISSED_FACTS) {
    const stripped = bullet.replace(pattern, '');
    assert.notEqual(stripped, bullet, `fact "${label}" matched nothing in the live bullet`);
    assert.deepEqual(missingDismissedFacts(stripped), [label], `stripping "${label}" must report exactly itself`);
  }
});

// --- interactive: Numbering rules ------------------------------------------------

test('the Numbering rules list Dismissed duplicates among the named batch sections', () => {
  assertInBatchList(INTERACTIVE, NAME);
});

test('control: deleting the name from the batch list fails assertInBatchList (list message)', () => {
  const mutated = doctor(INTERACTIVE, `${SECTIONS.PENDING}, ${NAME}, `, `${SECTIONS.PENDING}, `);
  assert.throws(() => assertInBatchList(mutated, NAME), { message: /does not put Dismissed duplicates between/ });
});

test('control: deleting the name from the non-empty parenthetical fails assertInBatchList (parenthetical message)', () => {
  const line = namedBatchBullet(INTERACTIVE);
  const anchor = line.indexOf('render only when non-empty');
  const open = line.lastIndexOf('(', anchor);
  const close = line.indexOf(')', anchor);
  const parenthetical = line.slice(open, close);
  assert.ok(parenthetical.includes(NAME));
  // Remove the name from the parenthetical alone; the list occurrence stays.
  const mutatedLine = line.slice(0, open) + parenthetical.replace(NAME, 'something else') + line.slice(close);
  const mutated = doctor(INTERACTIVE, line, mutatedLine);
  assert.throws(() => assertInBatchList(mutated, NAME), { message: /parenthetical does not name Dismissed duplicates/ });
});

// --- multi-spec template ---------------------------------------------------------

test('multispec-console-template.md renders a #### Dismissed duplicates heading', () => {
  assertHeading(MULTISPEC_TEMPLATE, NAME);
});

test('control: deleting the multispec heading fails assertHeading', () => {
  const mutated = doctor(MULTISPEC_TEMPLATE, `\n#### ${NAME} (`, '\n#### Something else (');
  assert.throws(() => assertHeading(mutated, NAME), { message: /no "#### Dismissed duplicates \(" heading/ });
});

test('control: moving the heading below Low-confidence findings fails assertHeading (order message)', () => {
  const head = `\n#### ${NAME} (`;
  const low = `\n#### ${SECTIONS.LOW} (`;
  const start = MULTISPEC_TEMPLATE.indexOf(head);
  const lowIdx = MULTISPEC_TEMPLATE.indexOf(low);
  const contestedIdx = MULTISPEC_TEMPLATE.indexOf(`\n#### ${SECTIONS.CONTESTED} (`);
  assert.ok(start !== -1 && lowIdx !== -1 && contestedIdx !== -1);
  assert.ok(start < lowIdx && lowIdx < contestedIdx);
  const block = MULTISPEC_TEMPLATE.slice(start, lowIdx);
  const without = MULTISPEC_TEMPLATE.slice(0, start) + MULTISPEC_TEMPLATE.slice(lowIdx);
  const at = without.indexOf(`\n#### ${SECTIONS.CONTESTED} (`);
  const permuted = without.slice(0, at) + block + without.slice(at);
  assert.notEqual(permuted, MULTISPEC_TEMPLATE);
  assert.throws(() => assertHeading(permuted, NAME), { message: /is not between/ });
});

test('control: a duplicated heading fails assertHeading', () => {
  const head = `\n#### ${NAME} (`;
  const mutated = doctor(MULTISPEC_TEMPLATE, head, `${head}x)\n${head}`);
  assert.throws(() => assertHeading(mutated, NAME), { message: /more than one/ });
});

// --- wrap-up/SKILL.md ------------------------------------------------------------

test("wrap-up/SKILL.md's Review Console section list names Dismissed duplicates", () => {
  assertInSkillList(WRAPUP_SKILL, NAME);
});

test('control: deleting the name from the Review Console section list fails assertInSkillList', () => {
  const mutated = doctor(WRAPUP_SKILL, `${SECTIONS.PENDING} / ${NAME} / `, `${SECTIONS.PENDING} / `);
  assert.throws(() => assertInSkillList(mutated, NAME), { message: /does not put Dismissed duplicates between/ });
});

// --- multispec-review-console.md: step-2 read list and Canonical render order ----------

const MULTISPEC_CONSOLE = read('plugin', 'skills', 'flow', 'multispec-review-console.md');

test("multispec-review-console.md's section enumerations name Dismissed duplicates after Pending review", () => {
  assertInMultispecOrder(MULTISPEC_CONSOLE, NAME);
});

test('control: dropping the name from either enumeration fails assertInMultispecOrder', () => {
  const adjacent = `${SECTIONS.PENDING}, ${NAME}, ${SECTIONS.LOW}`;
  const once = doctor(MULTISPEC_CONSOLE, adjacent, `${SECTIONS.PENDING}, ${SECTIONS.LOW}`);
  assert.throws(() => assertInMultispecOrder(once, NAME), { message: /carries .* 1 times, expected 2/ });
  const twice = doctor(once, adjacent, `${SECTIONS.PENDING}, ${SECTIONS.LOW}`);
  assert.throws(() => assertInMultispecOrder(twice, NAME), { message: /carries .* 0 times, expected 2/ });
});
