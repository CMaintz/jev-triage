import type { JevProvider, Question } from './providers/jev-provider.js';
import type { TriageConfig } from './config.js';

export interface DedupeCandidate {
  number: number;
  title: string;
}

/** Retrieves candidate issues by keyword. Injected so dedupe is testable without Octokit. */
export type DedupeSearch = (query: string, limit: number) => Promise<DedupeCandidate[]>;

/** Build the Jev Choice that judges which candidate (if any) duplicates the new issue. Pure. */
export function buildDedupeQuestion(candidates: DedupeCandidate[]): Record<string, Question> {
  const criteria: Record<string, string> = { none: 'none of the candidates is a duplicate' };
  for (const c of candidates) criteria[`#${c.number}`] = c.title;
  return {
    duplicate: {
      type: 'choice',
      instructions: 'Which existing issue, if any, is a duplicate of the NEW issue?',
      criteria,
    },
  };
}

/**
 * Retrieve-then-judge: find candidates by title keywords, then let Jev pick the duplicate
 * (or "none") from a bounded set. Returns the duplicate issue number, or null.
 * Jev is text-only and can't retrieve — retrieval is code, judgment is Jev.
 */
export async function findDuplicate(
  newIssue: { number: number; title: string; body: string | null | undefined },
  search: DedupeSearch,
  provider: JevProvider,
  config: TriageConfig,
): Promise<{ number: number; confidence: number } | null> {
  const found = await search(newIssue.title, config.dedupe_candidates);
  const candidates = found.filter((c) => c.number !== newIssue.number);
  if (candidates.length === 0) return null;

  const state = { new_issue: { title: newIssue.title, body: (newIssue.body ?? '').slice(0, 4000) }, candidates };
  const { answers } = await provider.evaluate({ state, questions: buildDedupeQuestion(candidates) });
  const ans = answers.duplicate;
  if (!ans || ans.type !== 'choice' || ans.choice === 'none') return null;
  if (ans.confidence < config.escalate_below) return null;

  const num = Number(ans.choice.replace('#', ''));
  return Number.isFinite(num) ? { number: num, confidence: ans.confidence } : null;
}
