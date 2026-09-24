// Generates demo.cast (asciinema v2) with correct ANSI escapes.
// Render: node demo/build-cast.mjs && npx svg-term-cli --in demo/demo.cast --out demo/demo.svg --window
import { writeFileSync } from 'node:fs';

const E = '\x1b';
const dim = (s) => `${E}[90m${s}${E}[0m`;
const cyan = (s) => `${E}[1;36m${s}${E}[0m`;
const bug = ` ${E}[1;41m bug ${E}[0m`;
const prio = ` ${E}[1;43m priority:major ${E}[0m`;
const green = (s) => `${E}[1;42m ${s} ${E}[0m`;

const steps = [
  [0.4, dim('# a new issue lands — triaged in one near-free Jev call') + '\r\n'],
  [0.9, '\r\n' + cyan('issue #142') + '  App crashes on export to PDF\r\n'],
  [1.1, '  jev-triage' + bug + prio + dim('  -> @team/backend') + dim('   89ms . $0.00001') + '\r\n'],
  [1.3, '\r\n' + dim('# on a schedule, it sweeps the whole open backlog') + '\r\n'],
  [0.8, cyan('$ jev-triage --backlog') + '\r\n'],
  [0.7, dim('  #98 bug/major   #103 question   #110 -> duplicate of #98   #121 spam') + '\r\n'],
  [0.5, dim('  ...') + '\r\n'],
  [1.0, '  ' + green('DONE') + dim('  1,204 issues triaged . 3 escalated to an LLM . $0.11') + '\r\n'],
  [1.3, '\r\n' + dim('# every issue typed & confidence-gated; humans/LLM only when unsure.') + '\r\n'],
  [1.4, ' '],
];

const header = { version: 2, width: 78, height: 16, env: { SHELL: '/bin/bash', TERM: 'xterm-256color' } };
let t = 0;
let out = JSON.stringify(header) + '\n';
for (const [d, text] of steps) {
  t += d;
  out += JSON.stringify([Number(t.toFixed(2)), 'o', text]) + '\n';
}
writeFileSync(new URL('./demo.cast', import.meta.url), out);
console.log('wrote demo/demo.cast');
