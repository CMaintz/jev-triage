import { load } from 'js-yaml';

/**
 * Declarative triage config, read from `.github/jev-triage.yml` in the consuming repo.
 * This file is the product's prompt-engineering surface: the `instructions`/`criteria`
 * strings are what steer Jev. Keep questions narrow and phrased positively — Jev reads
 * negations literally.
 */

type ChoiceConfig = {
  kind: 'choice';
  /** apply the chosen label directly (label name == option key). */
  apply_as_label?: boolean;
  options: Record<string, string>;
};

type ScoreConfig = {
  kind: 'score';
  /** ordered rubric levels, low -> high. */
  levels: string[];
  /** prefix for the emitted label, e.g. "priority:". */
  label_prefix?: string;
};

type NoulConfig = {
  kind: 'noul';
  instructions?: string;
  /** optional true/false meaning descriptions passed through to Jev for calibration. */
  criteria?: { true: string; false: string };
  /** label to apply when the yes-probability clears `min`. */
  apply_label?: string;
  /** probability threshold in [0,1]; default 0.8. */
  min?: number;
  /** emit a warning annotation / output when true (e.g. security). */
  alert?: boolean;
};

type QuestionConfig = ChoiceConfig | ScoreConfig | NoulConfig;

export interface TriageConfig {
  provider: 'cloudflare' | 'typesafe';
  model: string;
  /** confidence below which a Choice/Score answer is treated as uncertain. */
  escalate_below: number;
  on_low_confidence: 'label' | 'escalate' | 'comment';
  /** label applied when on_low_confidence === 'label'. */
  low_confidence_label: string;
  questions: Record<string, QuestionConfig>;
  /** deterministic map: chosen type label -> team handle. NOT a Jev question. */
  routing?: Record<string, string>;
  dry_run?: boolean;
}

const DEFAULTS = {
  // First-party is the simpler default: one secret, official pricing (output free),
  // pinned versions. Cloudflare is an optional alternative for those already on Workers AI.
  provider: 'typesafe',
  model: 'jev-1.13.0',
  escalate_below: 0.6,
  on_low_confidence: 'label',
  low_confidence_label: 'triage:needs-human',
} as const;

export function parseConfig(raw: string): TriageConfig {
  const parsed = (load(raw) ?? {}) as Partial<TriageConfig>;
  if (!parsed.questions || Object.keys(parsed.questions).length === 0) {
    throw new Error('jev-triage config must define at least one question.');
  }
  return { ...DEFAULTS, ...parsed, questions: parsed.questions };
}
