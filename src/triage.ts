import { buildState } from './core/state.js';
import { buildQuestions } from './core/questions.js';
import { decide } from './core/decide.js';
import { findDuplicate, type DedupeCandidate } from './dedupe.js';
import type { JevProvider } from './providers/jev-provider.js';
import type { LlmEscalator } from './llm.js';
import type { TriageConfig } from './config.js';

export interface IssueRef {
  number: number;
  title: string;
  body: string | null | undefined;
  labels: string[];
  isPullRequest?: boolean;
}

/** GitHub operations the orchestrator needs. Octokit implements this at the edge (main.ts). */
export interface GitHubPort {
  addLabels(issue: number, labels: string[]): Promise<void>;
  createComment(issue: number, body: string): Promise<void>;
  listOpenIssues(): Promise<IssueRef[]>;
  searchIssues(query: string, limit: number): Promise<DedupeCandidate[]>;
}

export interface TriageDeps {
  gh: GitHubPort;
  config: TriageConfig;
  provider: JevProvider;
  escalator?: LlmEscalator;
  dryRun: boolean;
}

export interface TriageResult {
  number: number;
  labels: string[];
  escalated: boolean;
  duplicateOf?: number;
  alerts: string[];
  usage?: { input_tokens: number; output_tokens: number };
  notes: string[];
}

const MARKER = '<!-- jev-triage:done -->';

export async function triageIssue(deps: TriageDeps, issue: IssueRef): Promise<TriageResult> {
  const { config, provider } = deps;
  const questions = buildQuestions(config);
  const state = buildState({ title: issue.title, body: issue.body, existingLabels: issue.labels });
  const { answers, usage } = await provider.evaluate({ state, questions });

  let decision = decide(answers, config);
  let escalated = false;
  let rationale: string | undefined;

  // Cascade: low confidence + an escalator wired → let the LLM re-answer, then re-decide.
  if (decision.escalate && config.on_low_confidence === 'escalate' && deps.escalator) {
    const llm = await deps.escalator.escalate(state, questions);
    decision = decide(llm.answers, config);
    escalated = true;
    rationale = llm.rationale;
  }

  // Dedupe: retrieve-then-judge (never for a PR).
  let duplicateOf: number | undefined;
  if (config.dedupe && !issue.isPullRequest) {
    const dup = await findDuplicate(issue, (q, limit) => deps.gh.searchIssues(q, limit), provider, config);
    if (dup) {
      duplicateOf = dup.number;
      if (!decision.labels.includes('possible-duplicate')) decision.labels.push('possible-duplicate');
    }
  }

  await apply(deps, issue.number, decision, {
    escalated,
    ...(rationale !== undefined ? { rationale } : {}),
    ...(duplicateOf !== undefined ? { duplicateOf } : {}),
  });

  return {
    number: issue.number,
    labels: decision.labels,
    escalated,
    alerts: decision.alerts,
    ...(duplicateOf !== undefined ? { duplicateOf } : {}),
    ...(usage ? { usage } : {}),
    notes: decision.notes,
  };
}

interface ApplyExtra {
  escalated: boolean;
  rationale?: string;
  duplicateOf?: number;
}

async function apply(
  deps: TriageDeps,
  issueNumber: number,
  decision: ReturnType<typeof decide>,
  extra: ApplyExtra,
): Promise<void> {
  const { gh, config, dryRun } = deps;
  if (dryRun) {
    const dupLine = extra.duplicateOf !== undefined ? `\nPossible duplicate of #${extra.duplicateOf}.` : '';
    await gh.createComment(
      issueNumber,
      `${MARKER}\n**Jev triage (dry run)** — would apply: \`${decision.labels.join('`, `') || '(none)'}\`${dupLine}`,
    );
    return;
  }
  const labels = [...decision.labels];
  if (config.marker_label) labels.push(config.marker_label);
  if (labels.length > 0) await gh.addLabels(issueNumber, labels);
  if (decision.routeTo) await gh.createComment(issueNumber, `${MARKER}\nRouted to ${decision.routeTo}.`);
  if (extra.duplicateOf !== undefined) {
    await gh.createComment(issueNumber, `${MARKER}\nPossible duplicate of #${extra.duplicateOf}.`);
  }
  if (extra.escalated && extra.rationale) {
    await gh.createComment(issueNumber, `${MARKER}\n**Escalated to LLM.** ${extra.rationale}`);
  }
}

export interface BacklogSummary {
  results: TriageResult[];
  skipped: number;
  total: number;
}

export async function triageBacklog(deps: TriageDeps): Promise<BacklogSummary> {
  const { config, gh } = deps;
  const marker = config.marker_label;
  const open = await gh.listOpenIssues();
  const results: TriageResult[] = [];
  let skipped = 0;

  for (const issue of open) {
    if (issue.isPullRequest) continue;
    if (marker && issue.labels.includes(marker)) {
      skipped++;
      continue;
    }
    if (config.max_issues > 0 && results.length >= config.max_issues) break;
    results.push(await triageIssue(deps, issue));
  }

  return { results, skipped, total: open.length };
}
