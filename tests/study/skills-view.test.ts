import { describe, expect, it } from 'vitest';
import { conceptFileName } from '@/lib/study/skills/names';
import { friendlyError } from '@/lib/study/ui/errors';
import {
  canSave,
  changeSummary,
  clientSkillMdErrors,
  diffRows,
  pushSummary,
  suggestSlug,
  warningRows,
} from '@/lib/study/ui/skills-view';

const same = (n: number, prefix = 'l') =>
  Array.from({ length: n }, (_, i) => ({ type: 'same' as const, text: `${prefix}${i}` }));

describe('visão das skills', () => {
  it('diffRows recolhe trechos iguais longos e mantém 3 linhas de contexto', () => {
    const rows = [...same(20), { type: 'add' as const, text: 'novo' }, ...same(2, 'fim')];
    const out = diffRows(rows, 3);
    expect(out.some((r) => r.kind === 'gap' && r.hidden === 17)).toBe(true);
    expect(out.filter((r) => r.kind === 'row' && r.type === 'same')).toHaveLength(3 + 2);
    expect(out.find((r) => r.kind === 'row' && r.type === 'add')).toBeTruthy();
    expect(diffRows(same(4), 3).every((r) => r.kind === 'row')).toBe(true);
  });
  it('changeSummary nos casos vazio, só adição e misto', () => {
    const none = { added: [], removed: [], changed: [] };
    expect(changeSummary(none, true)).toMatch(/Nada mudou/);
    expect(changeSummary({ added: ['a', 'b'], removed: [], changed: [] }, false)).toBe(
      '+2 conceitos',
    );
    expect(changeSummary({ added: ['a'], removed: ['b'], changed: ['c', 'd'] }, false)).toBe(
      '+1 conceito, −1, ~2 alterados',
    );
    expect(changeSummary(none, false)).toMatch(/texto/i);
  });
  it('warningRows agrupa por severidade, em português, sem mostrar o segredo inteiro', () => {
    const rows = warningRows([
      { file: 'SKILL.md', line: 4, kind: 'email', severity: 'avisa', excerpt: 'a@b.com' },
      {
        file: 'README.md',
        line: 2,
        kind: 'chave',
        severity: 'bloqueia',
        excerpt: 'ghp_…[oculto]',
      },
    ]);
    expect(rows[0]).toMatchObject({
      severity: 'bloqueia',
      label: 'Chave ou token',
      where: 'README.md:2',
    });
    expect(rows[1]).toMatchObject({ severity: 'avisa', label: 'E-mail' });
    expect(rows[0].excerpt.length).toBeLessThanOrEqual(40);
  });
  it('canSave: bloqueia com chave, exige confirmação para avisos e bloqueia com erro ou ocupado', () => {
    const warn = {
      file: 'f',
      line: 1,
      kind: 'email' as const,
      severity: 'avisa' as const,
      excerpt: 'x',
    };
    const block = { ...warn, kind: 'chave' as const, severity: 'bloqueia' as const };
    const base = { warnings: [], acknowledged: false, skillMdErrors: [], busy: false };
    expect(canSave(base).ok).toBe(true);
    expect(canSave({ ...base, warnings: [block], acknowledged: true }).ok).toBe(false);
    expect(canSave({ ...base, warnings: [warn] }).ok).toBe(false);
    expect(canSave({ ...base, warnings: [warn], acknowledged: true }).ok).toBe(true);
    expect(canSave({ ...base, skillMdErrors: ['faltou name'] })).toMatchObject({ ok: false });
    expect(canSave({ ...base, busy: true }).ok).toBe(false);
    expect(canSave({ ...base, warnings: [block] }).reason).toEqual(expect.any(String));
  });
  it('clientSkillMdErrors confere frontmatter, name e description', () => {
    const md = (name: string, desc: string) =>
      `---\nname: ${name}\ndescription: "${desc}"\n---\n# x\n`;
    expect(clientSkillMdErrors(md('sk', 'Use quando.'), 'sk')).toEqual([]);
    expect(clientSkillMdErrors('# sem', 'sk').length).toBeGreaterThan(0);
    expect(clientSkillMdErrors(md('outro', 'x'), 'sk').join(' ')).toMatch(/name/);
    expect(clientSkillMdErrors(md('sk', ''), 'sk').join(' ')).toMatch(/description/);
  });
  it('suggestSlug e pushSummary', () => {
    expect(suggestSlug('Média e Mediana')).toBe('media-e-mediana');
    expect(pushSummary({ branch: 'main', url: 'https://github.com/a/b', ahead: ['1 x'] })).toBe(
      'Enviar 1 commit de main para https://github.com/a/b',
    );
    expect(pushSummary({ branch: 'main', url: 'u', ahead: ['1', '2'] })).toBe(
      'Enviar 2 commits de main para u',
    );
  });
  it('conceptFileName não depende de módulo de servidor (cliente pode importar nomes)', () => {
    expect(conceptFileName({ id: 'x', label: 'Alfa' })).toMatch(/^alfa-[0-9a-f]{4}\.md$/);
  });
  it('friendlyError cobre os códigos novos das skills', () => {
    for (const code of [
      'CONCEITO_NAO_DOMINADO',
      'DADOS_SENSIVEIS',
      'VERSAO_DESATUALIZADA',
      'GIT_SEM_IDENTIDADE',
      'NADA_A_COMMITAR',
      'SEM_GIT',
      'SEM_DESTINO',
      'SEM_REMOTO',
      'REMOTO_DIFERENTE',
      'REMOTO_RECUSADO',
      'NADA_A_ENVIAR',
      'NADA_A_MELHORAR',
      'SKILL_INVALIDA',
      'SEM_REPOSITORIO',
      'DESTINO_INVALIDO',
      'SO_MODO_LOCAL',
      'MANIFESTO_INVALIDO',
      'DESTINO_DENTRO_DE_REPOSITORIO',
      'ESTADO_MUDOU',
      'CAMINHO_INVALIDO',
    ])
      expect(friendlyError(code, 'fallback'), code).not.toBe('fallback');
  });
});
