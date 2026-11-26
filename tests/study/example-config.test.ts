// Os arquivos de configuração que acompanham o repositório são da gurIA:
// .env.example curto e pronto para copiar, banco na porta da instalação pessoal,
// e nada herdado do OpenMAIC (chaves de API, pacotes, Discord, repositório antigo).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const read = (f: string) => readFileSync(join(root, f), 'utf8');

// Variáveis que o código da gurIA lê (lib/study, proxy.ts, next.config.ts, docker-compose.db.yml).
const KNOWN_VARS = new Set([
  'DATABASE_URL',
  'OWNER_SINGLE_USER',
  'OWNER_SINGLE_USER_ID',
  'GURIA_LOCAL',
  'OPENMAIC_DB_PORT',
  'PERSISTENCE_POSTGRES_PASSWORD',
  'GURIA_NEXT_DIST_DIR',
  'ALLOW_LOCAL_NETWORKS',
  'CODEX_HOME',
]);

describe('.env.example', () => {
  const text = read('.env.example');
  const active = text.split(/\r?\n/).filter((l) => /^[A-Z_0-9]+=/.test(l));
  const mentioned = [...text.matchAll(/^#?\s*([A-Z][A-Z_0-9]+)=/gm)].map((m) => m[1]);

  it('basta copiar: banco, dono único e modo local já vêm ativos', () => {
    expect(active).toContain(
      'DATABASE_URL=postgres://openmaic:openmaic-dev@127.0.0.1:5440/openmaic',
    );
    expect(active).toContain('OWNER_SINGLE_USER=true');
    expect(active).toContain('GURIA_LOCAL=true');
  });

  it('só cita variáveis que a gurIA usa, sem chaves de API', () => {
    expect(mentioned.filter((v) => !KNOWN_VARS.has(v))).toEqual([]);
    expect(text).not.toMatch(/_API_KEY|OpenMAIC|openmaic\.yml/);
    expect(text.split('\n').length).toBeLessThan(60);
  });
});

describe('banco local', () => {
  const compose = read('docker-compose.db.yml');
  const pkg = JSON.parse(read('package.json'));

  it('sobe na porta 5440 do projeto guria-db por padrão', () => {
    expect(compose).toMatch(/^name: guria-db$/m);
    expect(compose).toContain("'127.0.0.1:${OPENMAIC_DB_PORT:-5440}:5432'");
  });

  it('npm run db:up e db:down usam o projeto guria-db', () => {
    expect(pkg.scripts['db:up']).toBe(
      'docker compose -p guria-db -f docker-compose.db.yml up -d --wait postgres',
    );
    expect(pkg.scripts['db:down']).toBe(
      'docker compose -p guria-db -f docker-compose.db.yml stop postgres',
    );
  });
});

describe('arquivos herdados', () => {
  it('CONTRIBUTING e SECURITY são da gurIA', () => {
    for (const f of ['CONTRIBUTING.md', 'SECURITY.md']) {
      const text = read(f);
      expect(text, f).toMatch(/gurIA/);
      expect(text, f).not.toMatch(/THU-MAIC|discord|pnpm/i);
    }
  });

  it('os arquivos de ignore não citam o que já saiu', () => {
    expect(existsSync(join(root, '.dockerignore'))).toBe(false);
    for (const f of ['.gitignore', '.prettierignore'])
      expect(read(f), f).not.toMatch(
        /@openmaic|pnpm|openmaic\.yml|server-providers|\.next-pro-test/,
      );
  });
});
