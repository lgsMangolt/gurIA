import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Lint da gurIA: as regras recomendadas do Next para React e TypeScript.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', '.next-*/**', 'node_modules/**', 'logs/**', 'public/**']),
]);
