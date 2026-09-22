import { describe, expect, it } from 'vitest';
import { buildState } from '../src/core/state.js';

describe('buildState', () => {
  it('maps fields and defaults a null body to an empty string', () => {
    const s = buildState({ title: 'Crash on export', body: null, existingLabels: ['bug'] });
    expect(s).toEqual({ title: 'Crash on export', body: '', existing_labels: ['bug'] });
  });

  it('truncates an oversized body to the 8000-char cap', () => {
    const s = buildState({ title: 'T', body: 'x'.repeat(20000), existingLabels: [] });
    expect(s.body.length).toBe(8000);
  });

  it('passes a normal body through unchanged', () => {
    const s = buildState({ title: 'T', body: 'short body', existingLabels: [] });
    expect(s.body).toBe('short body');
  });
});
