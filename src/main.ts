import { readFile } from 'node:fs/promises';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { parseConfig } from './config.js';
import { buildState } from './core/state.js';
import { buildQuestions } from './core/questions.js';
import { decide } from './core/decide.js';
import { CloudflareProvider } from './providers/cloudflare.js';
import { TypeSafeProvider } from './providers/typesafe.js';
import type { JevProvider } from './providers/jev-provider.js';

const TRIAGED_MARKER = '<!-- jev-triage:done -->';

async function run(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const configPath = core.getInput('config-path') || '.github/jev-triage.yml';
  const dryRunInput = core.getBooleanInput('dry-run');

  const config = parseConfig(await readFile(configPath, 'utf8'));
  const dryRun = dryRunInput || config.dry_run === true;

  const issue = github.context.payload.issue;
  if (!issue) {
    core.info('No issue in payload; nothing to triage.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const state = buildState({
    title: issue.title,
    body: issue.body,
    existingLabels: (issue.labels ?? []).map((l: { name?: string } | string) =>
      typeof l === 'string' ? l : (l.name ?? ''),
    ),
  });

  const provider = makeProvider(config.provider, config.model);
  const questions = buildQuestions(config);

  const { answers, usage } = await provider.evaluate({ state, questions });
  const decision = decide(answers, config);

  if (dryRun) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body: `${TRIAGED_MARKER}\n**Jev triage (dry run)** — would apply: \`${decision.labels.join('`, `') || '(none)'}\`\n\n<details><summary>trace</summary>\n\n${decision.notes.map((n) => `- ${n}`).join('\n')}\n</details>`,
    });
  } else if (decision.labels.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issue.number,
      labels: decision.labels,
    });
  }

  if (decision.routeTo && !dryRun) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body: `${TRIAGED_MARKER}\nRouted to ${decision.routeTo}.`,
    });
  }

  for (const alert of decision.alerts) core.warning(`Jev flagged: ${alert} on issue #${issue.number}`);

  core.setOutput('applied-labels', decision.labels.join(','));
  core.setOutput('escalated', String(decision.escalate));

  await writeSummary(issue.number, decision, usage);
}

function makeProvider(kind: string, model: string): JevProvider {
  const apiKey = core.getInput('jev-api-key', { required: true });
  // Mask the key so it can never surface in logs (error bodies, debug output, etc.).
  core.setSecret(apiKey);
  if (kind === 'typesafe') return new TypeSafeProvider(apiKey, model);
  const accountId = core.getInput('cloudflare-account-id', { required: true });
  return new CloudflareProvider(accountId, apiKey);
}

async function writeSummary(
  issueNumber: number,
  decision: ReturnType<typeof decide>,
  usage?: { input_tokens: number; output_tokens: number },
): Promise<void> {
  const cost = usage ? (usage.input_tokens / 1_000_000) * 0.042 : 0;
  await core.summary
    .addHeading(`Jev triage — issue #${issueNumber}`)
    .addTable([
      [
        { data: 'Labels', header: true },
        { data: 'Escalated', header: true },
        { data: 'Input tokens', header: true },
        { data: 'Est. cost', header: true },
      ],
      [
        decision.labels.join(', ') || '(none)',
        String(decision.escalate),
        String(usage?.input_tokens ?? '?'),
        `$${cost.toFixed(6)}`,
      ],
    ])
    .addDetails('trace', decision.notes.map((n) => `- ${n}`).join('\n'))
    .write();
}

run().catch((err) => core.setFailed(err instanceof Error ? err.message : String(err)));
