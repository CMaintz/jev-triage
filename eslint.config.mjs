import foundry from './eslint.config.foundry.mjs';
import tseslint from 'typescript-eslint';

// Minimal by design: the Foundry base owns `max-len`; habit-hooks' TS sensor
// covers the rest (explicit-any, loose-equality, dead code, non-const). We only
// add the TS parser so those files parse, and ignore build output.
export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
  },
  ...foundry,
];
