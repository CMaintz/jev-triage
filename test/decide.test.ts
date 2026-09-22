import { describe, expect, it } from 'vitest';
import { decide } from '../src/core/decide.js';
import type { TriageConfig } from '../src/config.js';
import type { Answer } from '../src/providers/jev-provider.js';

const config: TriageConfig = {
  provider: 'cloudflare',
  model: 'jev-1.13.0',
  escalate_below: 0.6,
  on_low_confidence: 'label',
  low_confidence_label: 'triage:needs-human',
  questions: {
    type: { kind: 'choice', apply_as_label: true, options: { bug: 'defect', feature: 'new' } },
    severity: { kind: 'score', levels: ['trivial', 'minor', 'major', 'critical'], label_prefix: 'priority:' },
    security: { kind: 'noul', apply_label: 'security', min: 0.7, alert: true },
  },
  routing: { bug: '@team/backend' },
};

describe('decide', () => {
  it('applies confident labels and routes on the chosen type', () => {
    const answers: Record<string, Answer> = {
      type: { type: 'choice', choice: 'bug', confidence: 0.91, probabilities: { bug: 0.91, feature: 0.09 } },
      severity: { type: 'score', score: 2.4, confidence: 0.88, probabilities: {} },
      security: { type: 'noul', noul: 0.05 },
    };
    const d = decide(answers, config);
    expect(d.labels).toContain('bug');
    expect(d.labels).toContain('priority:major');
    expect(d.routeTo).toBe('@team/backend');
    expect(d.needsHuman).toBe(false);
  });

  it('never applies a low-confidence label — it flags for a human instead', () => {
    const answers: Record<string, Answer> = {
      type: { type: 'choice', choice: 'bug', confidence: 0.42, probabilities: { bug: 0.42, feature: 0.38 } },
      severity: { type: 'score', score: 1.0, confidence: 0.9, probabilities: {} },
      security: { type: 'noul', noul: 0.1 },
    };
    const d = decide(answers, config);
    expect(d.labels).not.toContain('bug');
    expect(d.labels).toContain('triage:needs-human');
    expect(d.needsHuman).toBe(true);
  });

  it('fires a Noul label + alert only above the threshold', () => {
    const answers: Record<string, Answer> = {
      type: { type: 'choice', choice: 'bug', confidence: 0.8, probabilities: {} },
      severity: { type: 'score', score: 0, confidence: 0.8, probabilities: {} },
      security: { type: 'noul', noul: 0.83 },
    };
    const d = decide(answers, config);
    expect(d.labels).toContain('security');
    expect(d.alerts).toContain('security');
  });

  it('escalates instead of labelling when on_low_confidence is "escalate"', () => {
    const escalateConfig = { ...config, on_low_confidence: 'escalate' as const };
    const answers: Record<string, Answer> = {
      type: { type: 'choice', choice: 'bug', confidence: 0.3, probabilities: { bug: 0.3 } },
      severity: { type: 'score', score: 1, confidence: 0.2, probabilities: {} },
      security: { type: 'noul', noul: 0.1 },
    };
    const d = decide(answers, escalateConfig);
    expect(d.escalate).toBe(true);
    expect(d.needsHuman).toBe(false);
    expect(d.labels).not.toContain('triage:needs-human');
  });

  it('records a note when an expected answer is missing', () => {
    const answers: Record<string, Answer> = {
      type: { type: 'choice', choice: 'bug', confidence: 0.9, probabilities: {} },
      // severity + security intentionally absent
    };
    const d = decide(answers, config);
    expect(d.notes.some((n) => n.includes('no answer'))).toBe(true);
  });
});
