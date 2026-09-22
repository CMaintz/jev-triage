# jev-triage

**Fast, near-free GitHub issue triage — powered by [TypeSafe AI's Jev](https://typesafe.ai/).**

Jev is a _System One_ model: text state in, **typed probabilistic decisions out** (`choice` / `score` / `noul`), each with a calibrated confidence, in ~70–500 ms at roughly free cost. That combination makes it viable to run on **every** issue the moment it opens — and to escalate only the ones it's unsure about to a human or a real LLM.

```yaml
# .github/workflows/triage.yml
on:
  issues: { types: [opened, edited, reopened] }
permissions: { issues: write, contents: read }
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: cmaintz/jev-triage@v0
        with:
          jev-api-key: ${{ secrets.JEV_API_KEY }}
          cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

```
--- run summary ---
#142  label=bug, priority:major   conf 0.91   ✓ applied
#143  type uncertain              conf 0.48   → triage:needs-human
#144  security flagged            noul 0.83   ⚠ alerted
1,204 issues triaged this month · $0.11
```

## Why this exists

Existing LLM triage bots are too slow and too expensive to run on every issue, and they hand you prose you still have to parse. Jev returns a _typed value your workflow branches on_ and a _confidence you gate on_. The result is triage that's cheap enough to always run and honest enough to defer when it isn't sure.

## How it works

1. On a new/edited issue, the title + body become the Jev `state`.
2. Your `.github/jev-triage.yml` defines the questions — one batched call answers them all (adding questions is near-free).
3. Confident answers become labels / routing; **low-confidence answers are never applied** — they get `triage:needs-human` or escalate to an LLM.
4. A run summary reports labels, escalations, tokens and estimated cost.

See [`examples/jev-triage.yml`](examples/jev-triage.yml) for the full config surface.

## Honest limitations

- **A first-pass, not a decision-maker.** Jev is ~68% accurate on classification — fast and cheap, not smarter. The confidence gate is the point. It never auto-_closes_ issues.
- **Text only.** Screenshots and attachments carry no signal to Jev.
- **No arithmetic / dates.** Those stay in code (e.g. routing is a deterministic map, not a Jev question).
- **Needs a Jev key.** Sign up at [TypeSafe](https://typesafe.ai/) for a first-party key, or use [Cloudflare Workers AI](https://developers.cloudflare.com/ai/models/typesafe/jev/) (`typesafe/jev`). First-party is the default (one secret).

## Status

Scaffold — **passes the Foundry gate** (`mise run gate`: lint → typecheck → test → audit), 13 unit tests, core coverage 100% lines / 84.9% branches, bundles clean. The provider adapters are **verified against the official [API reference](https://docs.typesafe.ai/api)** and [Cloudflare's model page](https://developers.cloudflare.com/ai/models/typesafe/jev/); not yet exercised against a live key. Contributions welcome. See [`CHANGELOG.md`](CHANGELOG.md) and the [full spec](../SPECS/jev-triage.md).

## Development

Quality is enforced through [Foundry](https://github.com/CMaintz/foundry)'s six-verb gate:

```bash
mise run gate   # lint → typecheck → test (coverage floor) → audit — the oracle
mise run fix    # auto-fix (eslint --fix + prune suppressions)
npm run build   # bundle dist/index.js (ncc) — commit the result
```

MIT © Christoffer Maintz
