# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-24

First stable release — Jev-powered GitHub issue triage: per-issue, backlog sweep, LLM escalation, and duplicate detection.

### Added

- **Per-issue triage:** title+body → Jev `state`, one batched call of choice/score/noul questions →
  typed answers become labels, `priority:` scores, spam/security flags, and deterministic team routing;
  confidence-gated with a `triage:needs-human` fallback and a dry-run mode.
- **Backlog sweep** — on `workflow_dispatch` / `schedule`, map-reduce every open issue (skips PRs and
  `marker_label`-tagged issues; capped by `max_issues`). Sweep a whole backlog for pennies.
- **LLM escalation cascade** — `on_low_confidence: escalate` + `llm-api-key` re-classifies low-confidence
  issues via any OpenAI-compatible endpoint (`llm-model` / `llm-base-url`), then labels + leaves a rationale.
- **Duplicate detection** (`dedupe: true`) — GitHub search retrieves candidates; a Jev Choice picks the
  duplicate (or "none"); a match gets `possible-duplicate` + a link (never auto-closes).
- `GitHubPort` seam keeps Octokit at the edge so the orchestrator (`triageIssue` / `triageBacklog`) is
  fully unit-tested; Step Summary reports labels, escalations, duplicates, skipped, tokens, and cost.
- Shared Jev provider port (TypeSafe + Cloudflare, `postJson` backoff); onboarded onto the Foundry gate.

### Verified

- Wire shape confirmed against [docs.typesafe.ai/api](https://docs.typesafe.ai/api) + Cloudflare's model page;
  `mise run gate` green; **28 unit tests** (+1 skipped live), coverage 99% lines / 86% branches. `dist/` bundled.
- **Live-validated against the real Jev API** (`test/live.test.ts`): a real bug report classified end-to-end.

### Known issues

- 1 high `undici` advisory reaches in via `@actions/github` (the official GitHub toolkit); no upstream fix
  yet, and it's below the `--audit-level=critical` gate. Renovate bumps it when fixed.
- The habits (structural-smell) CI job seeds its comment baseline via the `bootstrap` workflow on first run.
