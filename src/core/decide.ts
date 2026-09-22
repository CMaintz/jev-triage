import type { TriageConfig } from '../config.js';
import type { Answer } from '../providers/jev-provider.js';

/**
 * The heart of the Action, and the reason the core is a pure function: given Jev's answers
 * and the config, decide what to apply. No network, no Octokit — 100% unit-testable.
 *
 * The invariant: nothing is applied on low confidence. Jev is ~68% accurate; the confidence
 * gate is the design, not a nicety.
 */

export interface Decision {
  /** labels to add to the issue. */
  labels: string[];
  /** true if at least one high-signal answer was below threshold. */
  escalate: boolean;
  /** true if the issue should be flagged for a human. */
  needsHuman: boolean;
  /** team handle to ping, from the deterministic routing map. */
  routeTo?: string;
  /** answers with alert: true that fired (e.g. security). */
  alerts: string[];
  /** human-readable trace for the run summary. */
  notes: string[];
}

export function decide(answers: Record<string, Answer>, config: TriageConfig): Decision {
  const labels = new Set<string>();
  const alerts: string[] = [];
  const notes: string[] = [];
  let escalate = false;
  let needsHuman = false;
  let chosenType: string | undefined;

  const flagLowConfidence = (key: string, conf: number) => {
    notes.push(`${key}: low confidence (${conf.toFixed(2)}) — held`);
    if (config.on_low_confidence === 'escalate') escalate = true;
    else if (config.on_low_confidence === 'label') {
      labels.add(config.low_confidence_label);
      needsHuman = true;
    }
  };

  for (const [key, qc] of Object.entries(config.questions)) {
    const ans = answers[key];
    if (!ans) {
      notes.push(`${key}: no answer returned`);
      continue;
    }

    if (ans.type === 'choice') {
      if (ans.confidence >= config.escalate_below) {
        if (qc.kind === 'choice' && qc.apply_as_label) labels.add(ans.choice);
        chosenType ??= ans.choice;
        notes.push(`${key}: ${ans.choice} (${ans.confidence.toFixed(2)})`);
      } else {
        flagLowConfidence(key, ans.confidence);
      }
    } else if (ans.type === 'score') {
      if (ans.confidence >= config.escalate_below && qc.kind === 'score') {
        // round to the nearest ordered level; guard the bounds.
        const idx = Math.min(Math.max(Math.round(ans.score), 0), qc.levels.length - 1);
        const level = qc.levels[idx];
        if (level) labels.add(`${qc.label_prefix ?? ''}${level}`);
        notes.push(`${key}: ${level} (score ${ans.score.toFixed(2)}, ${ans.confidence.toFixed(2)})`);
      } else {
        flagLowConfidence(key, ans.confidence);
      }
    } else {
      // Noul: bare probability, no confidence field. Threshold is the gate.
      if (qc.kind === 'noul') {
        const min = qc.min ?? 0.8;
        if (ans.noul >= min) {
          if (qc.apply_label) labels.add(qc.apply_label);
          if (qc.alert) alerts.push(key);
          notes.push(`${key}: yes (${ans.noul.toFixed(2)})`);
        } else {
          notes.push(`${key}: no (${ans.noul.toFixed(2)})`);
        }
      }
    }
  }

  const routeTo = chosenType ? config.routing?.[chosenType] : undefined;

  return {
    labels: [...labels],
    escalate,
    needsHuman,
    ...(routeTo ? { routeTo } : {}),
    alerts,
    notes,
  };
}
