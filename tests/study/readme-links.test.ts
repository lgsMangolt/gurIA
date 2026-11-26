import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const readme = readFileSync(join(root, 'README.md'), 'utf8');

function relativeTargets(file: string, text: string): string[] {
  const found = [...text.matchAll(/\]\(([^)\s]+)\)|src="([^"]+)"/g)].map((m) => m[1] || m[2]);
  return found
    .filter((t) => !/^(https?:|mailto:|#)/.test(t))
    .map((t) => resolve(dirname(file), decodeURIComponent(t.split('#')[0])));
}

describe('README e docs', () => {
  it('todo link relativo e imagem do README existem', () => {
    const missing = relativeTargets(join(root, 'README.md'), readme).filter((p) => !existsSync(p));
    expect(missing).toEqual([]);
  });

  it('mostra os sete screenshots', () => {
    for (const name of ['rede-3d', 'rede-2d', 'plano', 'aulas', 'estudos', 'praticar', 'skills'])
      expect(readme).toContain(`docs/screenshots/${name}.png`);
  });

  it('o README cita Praticar e Skills e linka os guias', () => {
    expect(readme).toContain('docs/guia/skills.md');
    expect(readme).toContain('docs/screenshots/praticar.png');
    expect(readme).toContain('docs/screenshots/skills.png');
    expect(readme).toMatch(/Modos de estudo e exercícios/);
    expect(readme).not.toMatch(/em breve/i);
  });

  it('não referencia arquivos herdados removidos', () => {
    expect(readme).not.toMatch(/README\.openmaic\.md|README-zh\.md|CHANGELOG\.md|ESTUDOS\.md/);
  });

  it('mantém licença MIT e crédito curto ao OpenMAIC', () => {
    expect(readme).toContain('LICENSE');
    expect(readme).toContain('OpenMAIC');
  });

  it('não contém caminho de usuário nem o nome do dono', () => {
    expect(readme).not.toMatch(/C:\\Users|Lucas|AppData/i);
  });

  it('o guia de instalação cita as variáveis mínimas e os comandos', () => {
    const guide = readFileSync(join(root, 'docs', 'guia', 'instalacao.md'), 'utf8');
    for (const term of [
      'DATABASE_URL',
      'OWNER_SINGLE_USER',
      'GURIA_LOCAL',
      'npm ci',
      'npm run db:up',
      'npm run dev',
    ])
      expect(guide).toContain(term);
  });

  it('a instalação não depende do OpenMAIC nem de pnpm', () => {
    const guide = readFileSync(join(root, 'docs', 'guia', 'instalacao.md'), 'utf8');
    for (const text of [readme, guide]) {
      expect(text).not.toMatch(/pnpm|junction|build:packages|integração Pro/i);
      expect(text).toContain('npm ci');
    }
  });

  it('o README conta que o OpenMAIC saiu e que as tabelas antigas podem ser apagadas à mão', () => {
    expect(readme).toMatch(/não depende mais do OpenMAIC/);
    expect(readme).toMatch(/tabelas antigas/);
    expect(readme).toContain('docs/superpowers/notes/2026-11-20-fase-4-resultado.md');
  });

  it('o comando de execução abre 127.0.0.1, não localhost', () => {
    const guide = readFileSync(join(root, 'docs', 'guia', 'instalacao.md'), 'utf8');
    for (const text of [readme, guide]) {
      expect(text).toContain('npm run dev');
      expect(text).toContain('http://127.0.0.1:3033/study');
      expect(text).not.toContain('localhost:3033');
    }
  });

  it('a demo usa uma pasta de build própria para não bloquear o app pessoal', () => {
    const up = readFileSync(join(root, 'scripts', 'readme-demo', 'up.mjs'), 'utf8');
    expect(up).toContain("GURIA_NEXT_DIST_DIR: '.next-readme-demo'");
  });

  it('os arquivos herdados foram removidos', () => {
    for (const f of ['README-zh.md', 'README.openmaic.md', 'CHANGELOG.md', 'ESTUDOS.md'])
      expect(existsSync(join(root, f))).toBe(false);
  });

  it('o guia de instalação explica o conversor de documentos', () => {
    const guide = readFileSync(join(root, 'docs', 'guia', 'instalacao.md'), 'utf8');
    for (const term of ['install-markitdown.ps1', 'Python 3.12', 'MarkItDown 0.1.8'])
      expect(guide).toContain(term);
    expect(existsSync(join(root, 'scripts', 'install-markitdown.ps1'))).toBe(true);
  });

  it('o README apresenta Importar curso e linka o guia', () => {
    expect(readme).toContain('Importar curso');
    expect(readme).toContain('docs/guia/estudos.md#importar-um-curso');
  });

  it('o guia de estudos explica a importação de cursos', () => {
    const guide = readFileSync(join(root, 'docs', 'guia', 'estudos.md'), 'utf8');
    expect(guide).toMatch(/^## Importar um curso$/m);
    for (const term of [
      'YouTube',
      'Udemy',
      'só os arquivos que você já tem',
      'PDF',
      'zip',
      'licença',
      'sob demanda',
      'Processar o resto',
      'apostila',
    ])
      expect(guide).toContain(term);
  });
});
