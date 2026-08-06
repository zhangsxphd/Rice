import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'frontend/worker/**'] },
  {
    files: ['backend/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'error'
    }
  },
  {
    files: ['frontend/src/**/*.{js,jsx}', 'frontend/tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/set-state-in-effect': 'off'
    }
  }
];
