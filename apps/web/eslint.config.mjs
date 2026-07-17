// @ts-check
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

/**
 * Web ESLint flat config: TypeScript (root) + Next.js recommended.
 * `@next/eslint-plugin-next` is provided transitively by eslint-config-next.
 */
export default tseslint.config(
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
