import type { NextConfig } from 'next';
import path from 'node:path';
import { resolveStudyLocal } from './lib/study/brand';

// GURIA_LOCAL é o nome novo; o código interno ainda lê OPENMAIC_STUDY_LOCAL,
// então o valor resolvido é gravado nele para o servidor e injetado no cliente.
const studyLocal = resolveStudyLocal(process.env);
process.env.OPENMAIC_STUDY_LOCAL = studyLocal;

const nextConfig: NextConfig = {
  distDir: process.env.GURIA_NEXT_DIST_DIR || '.next',
  // Impede o Next dev de criar ou reescrever as instruções de agente do repositório (AGENTS.md).
  agentRules: false,
  output: 'standalone',
  webpack(config, { isServer, nextRuntime, webpack }) {
    // No navegador e no Edge não há módulos do Node: o código compartilhado que
    // importa node:crypto recebe a versão de navegador.
    if (!isServer || nextRuntime === 'edge') {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:crypto$/,
          path.resolve('lib/study/browser-crypto.ts'),
        ),
      );
    }
    return config;
  },
  env: {
    OPENMAIC_STUDY_LOCAL: studyLocal,
  },
  // O build checa os tipos só do app (o mesmo de `npm run typecheck`), sem os
  // testes e sem scripts soltos da pasta.
  typescript: { tsconfigPath: 'tsconfig.study.json' },
  experimental: {
    // O proxy repassa o corpo das requisições; aulas em vídeo vão até 200 MB.
    proxyClientMaxBodySize: '200mb',
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // A gurIA não pode ser embutida em páginas de outros sites.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
