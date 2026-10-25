#!/usr/bin/env node
// bin/manifesto-write.js — /flow Step 3's Pipeline Config Manifesto for a
// fresh run dir (adoption cases 2 and 5), in one call (#4027). The spec is
// skills/flow/manifesto.md; the procedure is lib/flow/manifesto.js.
//
//   node bin/manifesto-write.js --run <run-dir> --mode <auto|confirm|hybrid>
//     --mode-source <arg|dispatch|policy|default>
//     --ceremony <n>=<fast-lane|standard>[:judged][,...] [--help]
//
// --mode/--mode-source are flow/SKILL.md Step 1's resolved mode and deciding
// rung. --ceremony carries one entry per record: its ceremony:* label, or —
// suffixed `:judged` — the ceremony-check verdict for an unlabeled record
// (logged as a `Manifesto ceremony-check` line). The policy levers resolve
// through lib/flow/preflight.js's resolvePolicy (resolve-policy.js's own
// lib calls, with the run dir's --run overlay), from the cwd's checkout, as
// bin/resolve-policy.js does. Writes config.yml (13 levers, the
// integration-model run pin, spec:, created:), the decisions.md snapshot
// header (existing Step 2.8 lines kept below it), staged/, and the
// Manifesto's decision lines under `## /flow`.
//
// Stdout: the `### Pipeline Config (auto)` FYI table (markdown).
// Exit 0 written.
//      3 config.yml already present — a case-1 adoption: read preflight.levers.
//        Nothing is written.
//      2 malformed invocation (incl. --mode interactive: no Manifesto runs in
//        interactive mode); a --run that fails the anchored-or-outside guard
//        (lib/run-dir-guard.js — a worktree-local shadow is refused, [IL-127]),
//        is not a directory, or whose basename is not a run id; or a
//        decisions.md that already carries a snapshot header (a case-3
//        recovery — follow steps-and-gates.md case 3). Nothing is written.
//      1 a filesystem failure, or a lever that did not resolve. A config.yml
//        write that fails mid-batch removes the partial file; the stderr line
//        says what landed. Read manifesto.md and finish by hand.
// The --run guard takes compose-context.js's anchored-or-outside shape (exit
// 2), not the sanctioned writers' strict exit 3: here 3 is the case-1 answer
// its caller branches on, and the tests spawn against tmp-root run dirs.
'use strict';

const fs = require('fs');
const path = require('path');
const { anchoredOrOutsideMessage } = require('./lib/run-dir-guard');
const { canonicalRealpath } = require('./lib/path-guard');
const { defaultDeps: preflightDeps } = require('./lib/flow/preflight');
const {
  MODES, MODE_SOURCES, POLICY_REQUEST_KEYS, ManifestoInputError, AdoptedRunError, InitializedLogError,
  computeLevers, configPresent, runCreated, writeManifesto,
} = require('./lib/flow/manifesto');

const USAGE = 'usage: manifesto-write.js --run <run-dir> --mode <auto|confirm|hybrid> --mode-source <arg|dispatch|policy|default>\n'
  + '         --ceremony <n>=<fast-lane|standard>[:judged][,...] [--help]\n'
  + '  writes a fresh run\'s config.yml, decisions.md snapshot header, staged/ and Manifesto lines; prints the FYI table\n'
  + '  exit 0 written\n'
  + '       3 config.yml already present (case-1 adoption: read preflight.levers) — nothing written\n'
  + '       2 malformed invocation, --mode interactive, bad --run, or decisions.md already headed (case 3) — nothing written\n'
  + '       1 filesystem failure or an unresolved lever — read manifesto.md and finish by hand\n';

const FLAGS = { '--run': 'run', '--mode': 'mode', '--mode-source': 'modeSource', '--ceremony': 'ceremony' };

function parseArgs(argv) {
  const o = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { o.help = true; continue; }
    if (!Object.hasOwn(FLAGS, a)) return { error: `unknown argument: ${a}` };
    const v = argv[i + 1];
    if (typeof v !== 'string' || !v.trim() || v.startsWith('--')) return { error: `${a} needs a value` };
    o[FLAGS[a]] = v;
    i++;
  }
  return o;
}

// "4027=standard:judged,12=fast-lane" -> [{ n, ceremony, ceremonySource }]
function parseCeremony(raw) {
  const records = [];
  for (const item of raw.split(',')) {
    const m = /^#?([1-9]\d*)=(fast-lane|standard)(?::(judged))?$/.exec(item.trim());
    if (!m) return { error: `--ceremony entry ${JSON.stringify(item)} is not <n>=<fast-lane|standard>[:judged]` };
    const n = Number(m[1]);
    if (records.some((r) => r.n === n)) return { error: `--ceremony names #${n} more than once` };
    records.push({ n, ceremony: m[2], ceremonySource: m[3] ? 'judged' : 'label' });
  }
  return { records };
}

const realDeps = {
  cwd: () => process.cwd(),
  isDirectory: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  anchoredOrOutsideMessage,
  resolvePolicy: (keys, runDir, cwd) => preflightDeps(cwd).resolvePolicy(keys, runDir),
  now: () => Date.now(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, overrides = {}) {
  const deps = { ...realDeps, ...overrides };
  const usageError = (message) => { deps.stderr(`manifesto-write.js: ${message}\n${USAGE}`); return 2; };
  const refuse = (code, message) => { deps.stderr(`manifesto-write.js: ${message}\n`); return code; };

  const o = parseArgs(argv);
  if (o.error) return usageError(o.error);
  if (o.help) { deps.stdout(USAGE); return 0; }
  for (const flag of Object.keys(FLAGS)) if (!o[FLAGS[flag]]) return usageError(`${flag} is required`);
  if (o.mode === 'interactive') return usageError('--mode interactive runs no Manifesto (flow/manifesto.md\'s When to run) — nothing to write');
  if (!MODES.includes(o.mode)) return usageError(`--mode must be one of ${MODES.join(', ')}: ${o.mode}`);
  if (!MODE_SOURCES.includes(o.modeSource)) return usageError(`--mode-source must be one of ${MODE_SOURCES.join(', ')}: ${o.modeSource}`);
  const parsed = parseCeremony(o.ceremony);
  if (parsed.error) return usageError(parsed.error);

  let cwd;
  try { cwd = deps.cwd(); } catch (err) { return refuse(1, err && err.message); }
  let rejection;
  try { rejection = deps.anchoredOrOutsideMessage(o.run, cwd, '--run'); } catch (err) { return usageError(err && err.message); }
  if (rejection) return usageError(rejection);
  const resolvedRun = path.resolve(cwd, o.run);
  if (!deps.isDirectory(resolvedRun)) return usageError(`--run dir does not exist or is not a directory: ${o.run}`);
  const runDir = canonicalRealpath(resolvedRun) || resolvedRun;

  try {
    runCreated(runDir);
    if (configPresent(runDir)) return refuse(3, `config.yml already present in ${runDir} — a case-1 adoption: read preflight.levers instead`);
    const resolved = deps.resolvePolicy([...POLICY_REQUEST_KEYS], runDir, cwd) || {};
    const levers = computeLevers({ mode: o.mode, modeSource: o.modeSource, records: parsed.records, resolved });
    const pinEntry = resolved['integration-model'];
    const integrationModel = pinEntry && pinEntry.error === undefined && typeof pinEntry.value === 'string' ? pinEntry.value : null;
    const { table } = writeManifesto({ runDir, records: parsed.records, levers, integrationModel, now: deps.now() });
    if (!integrationModel) deps.stderr('manifesto-write.js: integration-model resolved empty — config.yml written without the run pin (SKIP logged)\n');
    deps.stdout(table);
    return 0;
  } catch (err) {
    if (err instanceof AdoptedRunError) return refuse(3, err.message);
    if (err instanceof ManifestoInputError) return usageError(err.message);
    if (err instanceof InitializedLogError) return refuse(2, err.message);
    return refuse(1, err && err.message ? err.message : String(err));
  }
}

module.exports = { run, parseArgs, parseCeremony };

if (require.main === module) process.exitCode = run(process.argv.slice(2));
