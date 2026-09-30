# jev-triage

Label GitHub issues for basically nothing, using [TypeSafe AI's Jev](https://typesafe.ai). Jev gives a label plus a confidence score; if it's not sure, the issue gets flagged for a human (or an LLM, if you give it a key) instead of guessing.

The code lives in [jev-tools](https://github.com/CMaintz/jev-tools/tree/main/packages/triage) now. This repo is just the wrapper so the action can sit on the Marketplace.

```yaml
on:
  issues:
    types: [opened]

permissions:
  issues: write

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: CMaintz/jev-triage@v2
        with:
          jev-api-key: ${{ secrets.JEV_API_KEY }}
```

Config, inputs and the escalation setup are documented in the [jev-tools triage README](https://github.com/CMaintz/jev-tools/tree/main/packages/triage#readme).

`@v1` still points at the old standalone version and keeps working.
