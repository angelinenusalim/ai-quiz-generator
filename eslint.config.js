import js from './server/node_modules/@eslint/js/src/index.js';
import globals from './server/node_modules/globals/index.js';
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'client/**'] },
  { files: ['server/**/*.js'], ...js.configs.recommended, languageOptions: { globals: globals.node }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^(req|res|next)$' }] } },
];
