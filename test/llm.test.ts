import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEscalationPrompt, OpenAiEscalator, parseLlmAnswers } from '../src/llm.js';
import type { Question } from '../src/providers/jev-provider.js';

const questions: Record<string, Question> = {
  type: { type: 'choice', instructions: 'category', criteria: { bug: 'a defect', feature: 'new' } },
  sev: { type: 'score', instructions: 'severity', criteria: ['low', 'high'] },
  spam: { type: 'noul', instructions: 'is spam?' },
};

describe('buildEscalationPrompt', () => {
  it('describes each question, its options, and the state', () => {
    const p = buildEscalationPrompt({ title: 'x' }, questions);
    expect(p).toContain('"type" (choice)');
    expect(p).toContain('bug: a defect');
    expect(p).toContain('"sev" (score)');
    expect(p).toContain('"spam" (noul)');
    expect(p).toContain('{"title":"x"}');
  });
});

describe('parseLlmAnswers', () => {
  it('coerces valid JSON into typed answers + rationale', () => {
    const raw = JSON.stringify({
      answers: {
        type: { type: 'choice', choice: 'bug', confidence: 0.9 },
        sev: { type: 'score', score: 1, confidence: 0.8 },
        spam: { type: 'noul', noul: 0.1 },
      },
      rationale: 'looks like a bug',
    });
    const out = parseLlmAnswers(raw, questions);
    expect(out.answers.type).toEqual({ type: 'choice', choice: 'bug', confidence: 0.9, probabilities: {} });
    expect(out.answers.sev).toMatchObject({ type: 'score', score: 1, confidence: 0.8 });
    expect(out.answers.spam).toEqual({ type: 'noul', noul: 0.1 });
    expect(out.rationale).toBe('looks like a bug');
  });

  it('drops invalid/missing answers and returns {} on non-JSON', () => {
    const out = parseLlmAnswers(
      JSON.stringify({ answers: { type: { type: 'choice', choice: 'nope' }, sev: { type: 'score' } } }),
      questions,
    );
    expect(out.answers.type).toBeUndefined();
    expect(out.answers.sev).toBeUndefined();
    expect(parseLlmAnswers('not json', questions).answers).toEqual({});
  });

  it('defaults missing confidence to 0.9 and clamps noul into [0,1]', () => {
    const out = parseLlmAnswers(
      JSON.stringify({ answers: { type: { type: 'choice', choice: 'bug' }, spam: { type: 'noul', noul: 5 } } }),
      questions,
    );
    expect(out.answers.type).toMatchObject({ confidence: 0.9 });
    expect(out.answers.spam).toEqual({ type: 'noul', noul: 1 });
    expect(out.rationale).toBeUndefined();
  });
});

describe('OpenAiEscalator', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts a chat completion and parses the JSON content', async () => {
    const content = JSON.stringify({ answers: { spam: { type: 'noul', noul: 0.2 } }, rationale: 'ok' });
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) }));
    vi.stubGlobal('fetch', fetchMock);

    const out = await new OpenAiEscalator({ apiKey: 'k', model: 'gpt-4o-mini' }).escalate({ title: 'x' }, questions);
    expect(out.answers.spam).toEqual({ type: 'noul', noul: 0.2 });
    expect(out.rationale).toBe('ok');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
