import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Excluded from the floor: the Actions entrypoint and the network adapters
      // (Octokit / fetch). These are I/O edges, exercised by integration tests
      // (see CHANGELOG "TODO before v0.1.0"), not units. jev-provider.ts is
      // types-only. Keeping them out makes the floor mean "the core logic".
      exclude: [
        'src/main.ts',
        'src/providers/cloudflare.ts',
        'src/providers/typesafe.ts',
        'src/providers/http.ts',
        'src/providers/jev-provider.ts',
      ],
      // Honest floor = today's measured number for the unit-tested core.
      // Ratchets up only, never down (Foundry CONTRACT.md).
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 80,
      },
    },
  },
});
