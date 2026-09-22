import type { TriageConfig } from '../config.js';
import type { Question } from '../providers/jev-provider.js';

/**
 * Translate the declarative config into a batch of Jev questions.
 * Pure. All questions ride one request — adding more is near-free.
 */
export function buildQuestions(config: TriageConfig): Record<string, Question> {
  const questions: Record<string, Question> = {};

  for (const [key, qc] of Object.entries(config.questions)) {
    switch (qc.kind) {
      case 'choice':
        questions[key] = {
          type: 'choice',
          instructions: `Classify: ${key}`,
          criteria: qc.options,
        };
        break;
      case 'score':
        questions[key] = {
          type: 'score',
          instructions: `Rate: ${key}`,
          criteria: qc.levels,
        };
        break;
      case 'noul':
        questions[key] = {
          type: 'noul',
          instructions: qc.instructions ?? `Is this ${key}?`,
          ...(qc.criteria ? { criteria: qc.criteria } : {}),
        };
        break;
    }
  }

  return questions;
}
