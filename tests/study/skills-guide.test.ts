import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..', '..');
const guidePath = join(root, 'docs', 'guia', 'skills.md');
const guide = readFileSync(guidePath, 'utf8');

describe('guia das skills', () => {
  it('explica destino, instalação e que a gurIA nunca publica sozinha', () => {
    for (const term of [
      'nunca publica sozinha',
      '~/.claude/skills/',
      '~/.codex/skills/',
      'skills-geradas',
    ])
      expect(guide).toContain(term);
  });
  it('cita a verificação de dados sensíveis e a revisão antes de salvar', () => {
    expect(guide).toMatch(/Bloqueia/);
    expect(guide).toMatch(/Revise/i);
    expect(guide).toMatch(/um commit por skill e versão/i);
  });
  it('o README linka o guia e todo link relativo do guia existe', () => {
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('docs/guia/skills.md');
    const targets = [...guide.matchAll(/\]\(([^)\s]+)\)/g)]
      .map((m) => m[1])
      .filter((t) => !/^(https?:|mailto:|#)/.test(t))
      .map((t) => resolve(dirname(guidePath), t.split('#')[0]));
    expect(targets.filter((p) => !existsSync(p))).toEqual([]);
  });
  it('não contém caminho de usuário nem dados pessoais', () => {
    expect(guide).not.toMatch(/C:\\Users|Lucas|AppData|@[a-z0-9.-]+\.[a-z]+/i);
  });
});
