/**
 * Flat config, which is the only format ESLint reads since 9. Replaces
 * .eslintrc.js and .eslintignore, neither of which it looks at any more.
 *
 * `@eslint/js` and `globals` are declared in package.json rather than leaned
 * on as transitive dependencies of eslint: they arrived that way under 9 and
 * stopped in 10, which took this config down with them.
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
    // don't ever lint node_modules, or build output. client/public is served
    // verbatim to browsers rather than compiled - config.js in there is a
    // deployment artefact overwritten at container start, not source.
    ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**', 'client/public/**'],
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
      /**
       * A leading underscore means "this exists because something else decided
       * the signature". Phaser's update(t, dt) and Colyseus' onLeave(client,
       * consented) have to be declared in full to be overridden at all, even
       * where the body wants none of it.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    /**
     * The integration test sets env vars that the server reads as it is
     * imported, and an `import` would hoist above them - so it requires the
     * server on purpose, after the assignments. The empty catch is deliberate
     * too: the office store may not exist yet, and that is the normal case.
     */
    files: ['server/test/integration.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 0,
      'no-empty': 0,
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
