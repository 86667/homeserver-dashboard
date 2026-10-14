import pluginNext from '@next/eslint-plugin-next';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.cache/**',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      '@next/next': pluginNext,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...pluginReact.configs.recommended.rules,
      ...pluginReactHooks.configs.recommended.rules,
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs['core-web-vitals'].rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/set-state-in-effect': 'off',

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  // The public side (src/features/account and its route group) and the admin
  // side share only the UI primitives and a few generic helpers. The public
  // side runs on instances reachable from the internet, so it must never pull
  // in admin code; the admin side has no use for the public feature.
  {
    files: ['src/features/account/**', 'src/app/(account)/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex:
                '^@/(?!components/ui/|hooks/useCopyFeedback$|lib/(utils|with-timeout|pubky-ring)$|features/account(/|$))',
              message:
                'The public account side may only use components/ui, hooks/useCopyFeedback, lib/utils, lib/with-timeout and lib/pubky-ring from the rest of the app.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**'],
    ignores: ['src/features/account/**', 'src/app/(account)/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@/features/account(/|$)',
              message: 'The admin side does not depend on the public account feature.',
            },
          ],
        },
      ],
    },
  },
];
