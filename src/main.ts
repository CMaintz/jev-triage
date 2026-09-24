import { readFile } from 'node:fs/promises';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseConfig } from './config.js';
import { CloudflareProvider } from './providers/cloudflare.js';
import { TypeSafeProvider } from './providers/typesafe.js';
import type { JevProvider } from './providers/jev-provider.js';
import { OpenAiEscalator, type LlmEscalator } from './llm.js';
import {
  triageBacklog,
  triageIssue,
  type GitHubPort,
  type IssueRef,
  type TriageDeps,
  type TriageResult,
} from './triage.js';
import type { DedupeCandidate } from './dedupe.js';

type Octokit = ReturnType<typeof github.getOctokit>;
type Labelish = string | { name?: string };

async function run(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const configPath = core.getInput('config-path') || '.github/jev-triage.yml';
  const config = parseConfig(await readFile(configPath, 'utf8'));
  const dryRun = core.getBooleanInput('dry-run') || config.dry_run === true;

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const escalator = makeEscalator();
  const deps: TriageDeps = {
    gh: makePort(octokit, owner, repo),
    config,
    provider: makeProvider(config.provider, config.model),
    dryRun,
    ...(escalator ? { escalator } : {}),
  };

  const issue = github.context.payload.issue;
  if (issue) {
    const result = await triageIssue(deps, toIssueRef(issue as PayloadIssue));
    finish([result], 0);
    return;
  }

  if (github.context.eventName === 'workflow_dispatch' || github.context.eventName === 'schedule') {
    const { results, skipped, total } = await triageBacklog(deps);
    core.info(`Backlog: triaged ${results.length}, skipped ${skipped} already-marked/PRs, ${total} open total.`);
    finish(results, skipped);
    return;
  }

  core.info('No issue in payload and not a backlog trigger (workflow_dispatch/schedule); nothing to triage.');
}

function finish(results: TriageResult[], skipped: number): void {
  for (const r of results) for (const alert of r.alerts) core.warning(`Jev flagged: ${alert} on issue #${r.number}`);
  core.setOutput('applied-labels', results.length === 1 ? (results[0]?.labels.join(',') ?? '') : '');
  core.setOutput('escalated', String(results.some((r) => r.escalated)));
  void writeSummary(results, skipped);
}

function makeProvider(kind: string, model: string): JevProvider {
  const apiKey = core.getInput('jev-api-key', { required: true });
  core.setSecret(apiKey); // never let the key surface in logs
  if (kind === 'typesafe') return new TypeSafeProvider(apiKey, model);
  const accountId = core.getInput('cloudflare-account-id', { required: true });
  return new CloudflareProvider(accountId, apiKey);
}

function makeEscalator(): LlmEscalator | undefined {
  const key = core.getInput('llm-api-key');
  if (!key) return undefined;
  core.setSecret(key);
  const model = core.getInput('llm-model') || 'gpt-4o-mini';
  const baseUrl = core.getInput('llm-base-url');
  return new OpenAiEscalator({ apiKey: key, model, ...(baseUrl ? { baseUrl } : {}) });
}

function labelName(l: Labelish): string {
  return typeof l === 'string' ? l : (l.name ?? '');
}

interface PayloadIssue {
  number: number;
  title: string;
  body?: string | null;
  labels?: Labelish[];
}

function toIssueRef(issue: PayloadIssue): IssueRef {
  return { number: issue.number, title: issue.title, body: issue.body, labels: (issue.labels ?? []).map(labelName) };
}

function makePort(octokit: Octokit, owner: string, repo: string): GitHubPort {
  return {
    addLabels: async (n, labels) => {
      await octokit.rest.issues.addLabels({ owner, repo, issue_number: n, labels });
    },
    createComment: async (n, body) => {
      await octokit.rest.issues.createComment({ owner, repo, issue_number: n, body });
    },
    listOpenIssues: async () => {
      const raw = await octokit.paginate(octokit.rest.issues.listForRepo, {
        owner,
        repo,
        state: 'open',
        per_page: 100,
      });
      return raw.map((i): IssueRef => ({
        number: i.number,
        title: i.title,
        body: i.body,
        labels: (i.labels ?? []).map((l) => labelName(l as Labelish)),
        isPullRequest: Boolean((i as { pull_request?: unknown }).pull_request),
      }));
    },
    searchIssues: async (query, limit) => {
      const res = await octokit.rest.search.issuesAndPullRequests({
        q: `repo:${owner}/${repo} is:issue is:open ${query}`,
        per_page: limit,
      });
      return res.data.items.map((i): DedupeCandidate => ({ number: i.number, title: i.title }));
    },
  };
}

async function writeSummary(results: TriageResult[], skipped: number): Promise<void> {
  const tokens = results.reduce((s, r) => s + (r.usage?.input_tokens ?? 0), 0);
  const cost = (tokens / 1_000_000) * 0.042;
  const escalated = results.filter((r) => r.escalated).length;
  const dupes = results.filter((r) => r.duplicateOf !== undefined).length;
  const plural = results.length === 1 ? '' : 's';
  await core.summary
    .addHeading(`Jev triage — ${results.length} issue${plural}`)
    .addTable([
      [
        { data: 'Triaged', header: true },
        { data: 'Escalated', header: true },
        { data: 'Duplicates', header: true },
        { data: 'Skipped', header: true },
        { data: 'Input tokens', header: true },
        { data: 'Est. cost', header: true },
      ],
      [
        String(results.length),
        String(escalated),
        String(dupes),
        String(skipped),
        String(tokens),
        `$${cost.toFixed(6)}`,
      ],
    ])
    .addDetails('trace', results.map((r) => `#${r.number}: ${r.labels.join(', ') || '(none)'}`).join('\n'))
    .write();
}

run().catch((err) => core.setFailed(err instanceof Error ? err.message : String(err)));
