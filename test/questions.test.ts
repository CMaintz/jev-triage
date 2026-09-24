import { describe, expect, it } from 'vitest';
import { buildQuestions } from '../src/core/questions.js';
import type { TriageConfig } from '../src/config.js';

const base: TriageConfig = {
  provider: 'typesafe',
  model: 'jev-1.13.0',
  escalate_below: 0.6,
  on_low_confidence: 'label',
  low_confidence_label: 'triage:needs-human',
  questions: {
    type: { kind: 'choice', apply_as_label: true, options: { bug: 'defect' } },
    sev: { kind: 'score', levels: ['a', 'b'] },
    spam: { kind: 'noul', apply_label: 'spam', criteria: { true: 'is spam', false: 'not spam' } },
  },
  max_issues: 200,
  marker_label: 'jev-triaged',
  dedupe: false,
  dedupe_candidates: 5,
};

describe('buildQuestions', () => {
  it('translates each config kind to the matching Jev primitive', () => {
    const q = buildQuestions(base);
    expect(q.type).toMatchObject({ type: 'choice', criteria: { bug: 'defect' } });
    expect(q.sev).toMatchObject({ type: 'score', criteria: ['a', 'b'] });
    expect(q.spam).toMatchObject({ type: 'noul', criteria: { true: 'is spam', false: 'not spam' } });
  });

  it('omits noul criteria when not configured', () => {
    const q = buildQuestions({ ...base, questions: { s: { kind: 'noul' } } });
    expect(q.s).toEqual({ type: 'noul', instructions: 'Is this s?' });
  });
});
