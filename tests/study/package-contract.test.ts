// O package.json da gurIA declara exatamente o que o projeto usa: nada do
// OpenMAIC, nenhum pacote importado sem declaração e nenhuma dependência sobrando.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
// @ts-expect-error script .mjs sem tipos
import { reach } from '../../scripts/import-graph.mjs';

const root = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const declared = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs|cjs)$/;
const sources = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => SOURCE.test(f) && fs.existsSync(path.join(root, f)));
const imported: string[] = reach(root, sources).packages;

// Usados sem import: peer do Next, compilador, tipos, CLIs chamadas pelos scripts.
const USED_WITHOUT_IMPORT = new Set(['react-dom', 'typescript', 'tsx', 'prettier']);

it('é o pacote da gurIA, sem postinstall', () => {
  expect(pkg.name).toBe('guria');
  expect(pkg.engines?.node).toBe('>=22.19.0');
  expect(pkg.scripts?.postinstall).toBeUndefined();
  expect(fs.existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(false);
});

it('todo pacote importado pelo projeto está declarado', () => {
  expect(imported.filter((p) => !(p in declared))).toEqual([]);
});

it('nenhuma dependência declarada sobra', () => {
  const unused = Object.keys(declared).filter(
    (d) => !imported.includes(d) && !USED_WITHOUT_IMPORT.has(d) && !d.startsWith('@types/'),
  );
  expect(unused).toEqual([]);
});

it('sem @openmaic nem workspace:', () => {
  const text = JSON.stringify(pkg);
  expect(text).not.toMatch(/@openmaic\//);
  expect(Object.values(declared).filter((v) => v.startsWith('workspace:'))).toEqual([]);
});

it('os scripts usam só ferramentas declaradas', () => {
  const bins: Record<string, string> = {
    next: 'next',
    vitest: 'vitest',
    tsc: 'typescript',
    tsx: 'tsx',
    prettier: 'prettier',
    eslint: 'eslint',
  };
  for (const [name, cmd] of Object.entries<string>(pkg.scripts ?? {})) {
    const bin = cmd.split(/\s+/)[0];
    if (bin === 'node' || bin === 'docker') continue;
    expect(bins[bin] && bins[bin] in declared, `${name}: ${bin}`).toBe(true);
  }
});
