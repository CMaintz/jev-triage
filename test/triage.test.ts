import { describe, expect, it } from 'vitest';
import { triageBacklog, triageIssue, type GitHubPort, type IssueRef, type TriageDeps } from '../src/triage.js';
import type { TriageConfig } from '../src/config.js';
import type { Answer, JevProvider } from '../src/providers/jev-provider.js';
import type { LlmEscalator } from '../src/llm.js';

const baseConfig: TriageConfig = {
  provider: 'typesafe',
  model: 'jev-1.13.0',
  escalate_below: 0.6,
  on_low_confidence: 'label',
  low_confidence_label: 'triage:needs-human',
  questions: { type: { kind: 'choice', apply_as_label: true, options: { bug: 'defect', feature: 'new' } } },
  routing: { bug: '@team/backend' },
  max_issues: 200,
  marker_label: 'jev-triaged',
  dedupe: false,
  dedupe_candidates: 5,
};

interface Recorder {
  port: GitHubPort;
  labeled: Record<number, string[]>;
  comments: { n: number; body: string }[];
}

function recorder(overrides: Partial<GitHubPort> = {}): Recorder {
  const labeled: Record<number, string[]> = {};
  const comments: { n: number; body: string }[] = [];
  const port: GitHubPort = {
    addLabels: async (n, labels) => {
      labeled[n] = [...(labeled[n] ?? []), ...labels];
    },
    createComment: async (n, body) => {
      comments.push({ n, body });
    },
    listOpenIssues: async () => [],
    searchIssues: async () => [],
    ...overrides,
  };
  return { port, labeled, comments };
}

const jev = (answers: Record<string, Answer>): JevProvider => ({
  evaluate: async () => ({ model: 't', answers, usage: { input_tokens: 100, output_tokens: 10 } }),
});
const confidentBug: Record<string, Answer> = {
  type: { type: 'choice', choice: 'bug', confidence: 0.9, probabilities: {} },
};
const uncertain: Record<string, Answer> = {
  type: { type: 'choice', choice: 'bug', confidence: 0.3, probabilities: {} },
};

describe('triageIssue', () => {
  it('applies confident labels + the marker + routes the team', async () => {
    const { port, labeled, comments } = recorder();
    const deps: TriageDeps = { gh: port, config: baseConfig, provider: jev(confidentBug), dryRun: false };
    const r = await triageIssue(deps, { number: 1, title: 'crash', body: 'x', labels: [] });
    expect(r.labels).toContain('bug');
    expect(labeled[1]).toEqual(expect.arrayContaining(['bug', 'jev-triaged']));
    expect(comments.some((c) => c.body.includes('Routed to @team/backend'))).toBe(true);
  });

  it('escalates to the LLM on low confidence and re-decides on its answers', async () => {
    const { port, labeled, comments } = recorder();
    const escalator: LlmEscalator = {
      escalate: async () => ({
        answers: { type: { type: 'choice', choice: 'feature', confidence: 0.95, probabilities: {} } },
        rationale: 'clearly a request',
      }),
    };
    const deps: TriageDeps = {
      gh: port,
      config: { ...baseConfig, on_low_confidence: 'escalate' },
      provider: jev(uncertain),
      escalator,
      dryRun: false,
    };
    const r = await triageIssue(deps, { number: 2, title: 't', body: 'x', labels: [] });
    expect(r.escalated).toBe(true);
    expect(labeled[2]).toContain('feature');
    expect(comments.some((c) => c.body.includes('Escalated to LLM'))).toBe(true);
  });

  it('dry-run comments instead of labelling', async () => {
    const { port, labeled, comments } = recorder();
    const deps: TriageDeps = { gh: port, config: baseConfig, provider: jev(confidentBug), dryRun: true };
    await triageIssue(deps, { number: 3, title: 't', body: 'x', labels: [] });
    expect(labeled[3]).toBeUndefined();
    expect(comments[0]?.body).toContain('dry run');
  });

  it('flags a duplicate when dedupe is on', async () => {
    const { port, labeled } = recorder({ searchIssues: async () => [{ number: 9, title: 'same crash' }] });
    const provider: JevProvider = {
      evaluate: async (req) => ({
        model: 't',
        answers:
          'duplicate' in req.questions
            ? { duplicate: { type: 'choice', choice: '#9', confidence: 0.9, probabilities: {} } }
            : confidentBug,
      }),
    };
    const deps: TriageDeps = { gh: port, config: { ...baseConfig, dedupe: true }, provider, dryRun: false };
    const r = await triageIssue(deps, { number: 4, title: 'crash', body: 'x', labels: [] });
    expect(r.duplicateOf).toBe(9);
    expect(labeled[4]).toContain('possible-duplicate');
  });
});

describe('triageBacklog', () => {
  it('triages open issues, skipping PRs and already-marked ones', async () => {
    const open: IssueRef[] = [
      { number: 1, title: 'a', body: '', labels: [] },
      { number: 2, title: 'pr', body: '', labels: [], isPullRequest: true },
      { number: 3, title: 'done', body: '', labels: ['jev-triaged'] },
    ];
    const { port, labeled } = recorder({ listOpenIssues: async () => open });
    const deps: TriageDeps = { gh: port, config: baseConfig, provider: jev(confidentBug), dryRun: false };
    const summary = await triageBacklog(deps);
    expect(summary.results.map((r) => r.number)).toEqual([1]);
    expect(summary.skipped).toBe(1);
    expect(summary.total).toBe(3);
    expect(labeled[1]).toContain('bug');
  });

  it('respects max_issues', async () => {
    const open: IssueRef[] = [1, 2, 3].map((n) => ({ number: n, title: 't', body: '', labels: [] }));
    const { port } = recorder({ listOpenIssues: async () => open });
    const deps: TriageDeps = {
      gh: port,
      config: { ...baseConfig, max_issues: 2 },
      provider: jev(confidentBug),
      dryRun: false,
    };
    const summary = await triageBacklog(deps);
    expect(summary.results.length).toBe(2);
  });
});
