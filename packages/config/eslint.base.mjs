import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export function crearConfigEslintBase() {
  return tseslint.config(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/next-env.d.ts',
        '**/.expo/**',
        '**/coverage/**',
        '.agents/**',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{ts,tsx,js,mjs,cjs}'],
      languageOptions: {
        ecmaVersion: 2022,
        globals: {
          ...globals.node,
        },
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-console': 'off',
      },
    },
  );
}
