import type { Answer, Question } from './providers/jev-provider.js';
import { postJson } from './providers/http.js';

export interface LlmEscalation {
  answers: Record<string, Answer>;
  rationale?: string;
}

export interface LlmEscalator {
  escalate(state: unknown, questions: Record<string, Question>): Promise<LlmEscalation>;
}

/** Describe each question + criteria and demand JSON in Jev's answer shape. Pure. */
export function buildEscalationPrompt(state: unknown, questions: Record<string, Question>): string {
  const specs = Object.entries(questions)
    .map(([key, q]) => {
      if (q.type === 'choice') {
        const opts = Object.entries(q.criteria)
          .map(([k, v]) => `      ${k}: ${v}`)
          .join('\n');
        return `- "${key}" (choice): ${q.instructions}\n    options:\n${opts}\n    answer: {"type":"choice","choice":<option key>,"confidence":<0..1>}`;
      }
      if (q.type === 'score') {
        const levels = q.criteria.map((lvl, i) => `      ${i}: ${lvl}`).join('\n');
        return `- "${key}" (score): ${q.instructions}\n    levels:\n${levels}\n    answer: {"type":"score","score":<0..${q.criteria.length - 1}>,"confidence":<0..1>}`;
      }
      return `- "${key}" (noul): ${q.instructions}\n    answer: {"type":"noul","noul":<probability 0..1 that it is true>}`;
    })
    .join('\n\n');

  return [
    'Triage the item below by answering every question.',
    '',
    'ITEM STATE (JSON):',
    JSON.stringify(state),
    '',
    'QUESTIONS:',
    specs,
    '',
    'Return ONLY: {"answers": {"<question id>": <answer>, ...}, "rationale": "<one sentence>"}',
  ].join('\n');
}

/** Coerce the LLM's JSON into validated Jev-shaped answers. Malformed entries are dropped. Pure. */
export function parseLlmAnswers(raw: string, questions: Record<string, Question>): LlmEscalation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { answers: {} };
  }
  const obj = (parsed ?? {}) as { answers?: Record<string, unknown>; rationale?: unknown };
  const src = obj.answers ?? {};
  const answers: Record<string, Answer> = {};

  for (const [key, q] of Object.entries(questions)) {
    const a = src[key] as Record<string, unknown> | undefined;
    if (!a) continue;
    if (q.type === 'choice') {
      const choice = String(a.choice ?? '');
      if (!(choice in q.criteria)) continue;
      answers[key] = { type: 'choice', choice, confidence: clamp01(a.confidence), probabilities: {} };
    } else if (q.type === 'score') {
      const score = toNum(a.score);
      if (score === undefined) continue;
      answers[key] = { type: 'score', score, confidence: clamp01(a.confidence), probabilities: {} };
    } else {
      const noul = toNum(a.noul);
      if (noul === undefined) continue;
      answers[key] = { type: 'noul', noul: Math.min(Math.max(noul, 0), 1) };
    }
  }

  const rationale = typeof obj.rationale === 'string' ? obj.rationale : undefined;
  return { answers, ...(rationale ? { rationale } : {}) };
}

function toNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function clamp01(v: unknown): number {
  const n = toNum(v);
  return n === undefined ? 0.9 : Math.min(Math.max(n, 0), 1);
}

export interface OpenAiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** OpenAI-compatible chat-completions escalator — works with any compatible endpoint via `baseUrl`. */
export class OpenAiEscalator implements LlmEscalator {
  constructor(private readonly cfg: OpenAiConfig) {}

  async escalate(state: unknown, questions: Record<string, Question>): Promise<LlmEscalation> {
    const base = this.cfg.baseUrl ?? 'https://api.openai.com/v1';
    const json = (await postJson(
      `${base}/chat/completions`,
      { Authorization: `Bearer ${this.cfg.apiKey}` },
      {
        model: this.cfg.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a precise issue-triage classifier. Reply with JSON only.' },
          { role: 'user', content: buildEscalationPrompt(state, questions) },
        ],
      },
    )) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? '{}';
    return parseLlmAnswers(content, questions);
  }
}
