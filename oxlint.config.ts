import { defineConfig } from 'oxlint';

export default defineConfig({
  ignorePatterns: ['dist', 'node_modules'],
  plugins: ['typescript', 'react', 'oxc', 'unicorn'],
  jsPlugins: [{ name: 'react-hooks-js', specifier: 'eslint-plugin-react-hooks' }],
  categories: { correctness: 'error' },
  rules: {
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'warn',
    'react-hooks-js/set-state-in-render': 'error',
    'react-hooks-js/immutability': 'error',
    'react-hooks-js/refs': 'error',
  },
});
