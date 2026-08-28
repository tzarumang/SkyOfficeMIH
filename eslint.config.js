/**
 * Flat config, which is the only format ESLint 9 reads. Replaces .eslintrc.js
 * and .eslintignore, both of which ESLint 9 ignores.
 *
 * Two rules from the old config are gone rather than translated:
 * `ban-ts-ignore` was folded into `ban-ts-comment` several majors ago, and
 * `member-delimiter-style` moved out to the stylistic plugin - formatting here
 * is prettier's job, so neither is worth pulling back in.
 */
const js = require('@eslint/js')
const globals = require('globals')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')

module.exports = [
  {
    // don't ever lint node_modules, or build output
    ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs['eslint-recommended'].overrides[0].rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-explicit-any': 0,
    },
  },
  {
    // config files and scripts are plain CommonJS
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
]
