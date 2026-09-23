import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { buildState } from '../src/core/state.js';
import { buildQuestions } from '../src/core/questions.js';
import { decide } from '../src/core/decide.js';
import { TypeSafeProvider } from '../src/providers/typesafe.js';

// Runs only when JEV_API_KEY is set (via `node --env-file=.env`); skipped otherwise,
// so `mise run gate` stays green without a key.
const KEY = process.env.JEV_API_KEY;

const CONFIG = `
provider: typesafe
model: jev-1.13.0
escalate_below: 0.6
questions:
  type:
    kind: choice
    apply_as_label: true
    options:
      bug: "a defect in existing behavior"
      feature: "a request for new capability"
      question: "a usage question, not a defect"
  severity:
    kind: score
    levels: [trivial, minor, major, critical]
    label_prefix: "priority:"
  spam:
    kind: noul
    instructions: "Is this spam or not a genuine issue?"
    apply_label: spam
    min: 0.85
`;

describe.skipIf(!KEY)('live Jev triage smoke', () => {
  it('classifies a real bug report end-to-end', async () => {
    const config = parseConfig(CONFIG);
    const provider = new TypeSafeProvider(KEY as string);
    const state = buildState({
      title: 'App crashes on export to PDF',
      body: 'Steps: open a document, File > Export, nothing happens. Console shows a null reference.',
      existingLabels: [],
    });
    const { answers, usage } = await provider.evaluate({ state, questions: buildQuestions(config) });
    const decision = decide(answers, config);
    console.log('live triage →', JSON.stringify({ labels: decision.labels, notes: decision.notes, usage }));

    const type = answers.type;
    expect(type?.type).toBe('choice');
    if (type?.type === 'choice') {
      expect(['bug', 'feature', 'question']).toContain(type.choice);
    }
  });
});
