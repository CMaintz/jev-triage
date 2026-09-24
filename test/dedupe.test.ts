import { describe, expect, it } from 'vitest';
import { buildDedupeQuestion, findDuplicate } from '../src/dedupe.js';
import type { TriageConfig } from '../src/config.js';
import type { Answer, JevProvider } from '../src/providers/jev-provider.js';

const config: TriageConfig = {
  provider: 'typesafe',
  model: 'jev-1.13.0',
  escalate_below: 0.6,
  on_low_confidence: 'label',
  low_confidence_label: 'x',
  questions: {},
  max_issues: 200,
  marker_label: 'jev-triaged',
  dedupe: true,
  dedupe_candidates: 5,
};

const providerReturning = (choice: string, confidence: number): JevProvider => ({
  evaluate: async () => ({
    model: 't',
    answers: { duplicate: { type: 'choice', choice, confidence, probabilities: {} } satisfies Answer },
  }),
});

const search = async () => [
  { number: 12, title: 'crash on export' },
  { number: 5, title: 'unrelated' },
];

describe('buildDedupeQuestion', () => {
  it('includes a none option and each candidate keyed by number', () => {
    const q = buildDedupeQuestion([{ number: 12, title: 'crash on export' }]);
    const criteria = (q.duplicate as { criteria: Record<string, string> }).criteria;
    expect(Object.keys(criteria)).toEqual(['none', '#12']);
  });
});

describe('findDuplicate', () => {
  it('returns the chosen duplicate above the confidence floor', async () => {
    const dup = await findDuplicate(
      { number: 20, title: 'crashes exporting', body: '' },
      search,
      providerReturning('#12', 0.8),
      config,
    );
    expect(dup).toEqual({ number: 12, confidence: 0.8 });
  });

  it('returns null on "none", low confidence, or no candidates', async () => {
    const base = { number: 20, title: 't', body: '' };
    expect(await findDuplicate(base, search, providerReturning('none', 0.9), config)).toBeNull();
    expect(await findDuplicate(base, search, providerReturning('#12', 0.3), config)).toBeNull();
    expect(await findDuplicate(base, async () => [], providerReturning('#12', 0.9), config)).toBeNull();
  });

  it('excludes the issue itself from candidates', async () => {
    const selfOnly = async () => [{ number: 20, title: 'self' }];
    expect(
      await findDuplicate({ number: 20, title: 't', body: '' }, selfOnly, providerReturning('#20', 0.9), config),
    ).toBeNull();
  });
});
