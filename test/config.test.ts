import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('applies defaults over a minimal config', () => {
    const c = parseConfig('questions:\n  spam:\n    kind: noul\n');
    expect(c.provider).toBe('typesafe');
    expect(c.model).toBe('jev-1.13.0');
    expect(c.escalate_below).toBe(0.6);
    expect(c.on_low_confidence).toBe('label');
    expect(c.low_confidence_label).toBe('triage:needs-human');
  });

  it('throws when no questions are defined', () => {
    expect(() => parseConfig('provider: typesafe\n')).toThrow(/at least one question/);
    expect(() => parseConfig('')).toThrow(/at least one question/);
  });

  it('keeps explicit overrides', () => {
    const c = parseConfig('provider: cloudflare\nescalate_below: 0.8\nquestions:\n  x:\n    kind: noul\n');
    expect(c.provider).toBe('cloudflare');
    expect(c.escalate_below).toBe(0.8);
  });
});
