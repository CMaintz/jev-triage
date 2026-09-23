# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Scaffold: typed Jev provider port with Cloudflare + TypeSafe adapters.
- Pure triage core (`buildState`, `buildQuestions`, `decide`) with unit tests.
- Declarative `.github/jev-triage.yml` config (choice / score / noul questions).
- Confidence-gated labelling with `triage:needs-human` fallback; dry-run mode.
- GitHub Step Summary reporting labels, escalation, tokens and estimated cost.
- Shared `postJson` helper with 429/529 exponential backoff (per API docs).
- Optional Noul `criteria` (true/false meanings) for better calibration.
- Onboarded onto the **Foundry** engineering gate: `mise.toml` (six-verb interface),
  vendored ESLint base + `.prettierrc`, vitest coverage floor, `.gitleaks.toml`,
  `renovate.json`, `scripts/ruleset_guard.py`, `.gitattributes` LF normalization, and the
  Foundry reusable caller workflows (gate / security / ratchet / bootstrap `@v1.2.0`).
  Replaces the placeholder CI.
- `knip` + `ts-morph` dev-deps and `knip.json` so the habit-hooks TS sensors run.

### Verified

- Request/response wire shape confirmed against [docs.typesafe.ai/api](https://docs.typesafe.ai/api)
  and Cloudflare's model page (2026-09): first-party `POST /v1/systemone` with `{model,state,questions}`;
  Cloudflare `POST /ai/run` with `{model,input:{state,questions}}`, raw (un-enveloped) response.
- **`mise run gate` (lint → typecheck → test → audit) passes locally.** 13 unit tests;
  core coverage 100% lines / 84.9% branches (floor 80). Bundled `dist/index.js` committed.
- Upgraded vitest → 5.x to clear 2 critical advisories the gate's `audit` flagged; removed
  the `prettier` false-positive and all 10 unused-exports the habit sensors found.
- **Live-validated against the real Jev API** (`test/live.test.ts`, skipped without a key):
  a real bug report classified end-to-end through the provider port + triage core.

### Known issues

- 1 high `undici` advisory reaches in via `@actions/github` (the official GitHub toolkit);
  no upstream fix exists yet, and it's below the `--audit-level=critical` gate. Renovate bumps it when fixed.
- habits (structural-smell) job: 43 `non-essential-comment` findings remain; these seed as the
  ratchet baseline via the `bootstrap` workflow on first push (Foundry's designed onboarding).

### TODO before v0.1.0

- Seed the habit-hooks snooze baseline (run the `bootstrap` workflow once on GitHub).
- E2E test on a real repo (labels applied, summary rendered).
