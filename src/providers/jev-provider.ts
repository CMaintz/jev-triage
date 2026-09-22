/**
 * The Jev provider port. The triage engine depends only on this interface,
 * never on a concrete backend (Cloudflare Workers AI vs. TypeSafe first-party).
 *
 * Shapes verified against https://docs.typesafe.ai/api and Cloudflare's model page (2026-09).
 * Not yet exercised against a live key.
 */

type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  /** label -> description of when to pick it. Up to 255 options. */
  criteria: Record<string, string>;
};

type ScoreQuestion = {
  type: 'score';
  instructions: string;
  /** ordered rubric levels, low -> high (2..10 levels). */
  criteria: string[];
};

type NoulQuestion = {
  type: 'noul';
  instructions: string;
  /** optional descriptions of what true/false mean — improves calibration. */
  criteria?: { true: string; false: string };
};

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

type ScoreAnswer = {
  type: 'score';
  /** may be fractional, e.g. 1.04 */
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
  legend?: Record<string, string>;
};

/** Noul returns a bare probability in [0,1] that the statement is true. No confidence field. */
type NoulAnswer = {
  type: 'noul';
  noul: number;
};

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface JevRequest {
  /** structured or unstructured program state; text only (no images). */
  state: unknown;
  /** batch of narrow, well-scoped questions evaluated in parallel against `state`. */
  questions: Record<string, Question>;
}

export interface JevResponse {
  model: string;
  answers: Record<string, Answer>;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface JevProvider {
  /** One round-trip. Adding questions is near-free: they are evaluated in parallel. */
  evaluate(req: JevRequest): Promise<JevResponse>;
}
