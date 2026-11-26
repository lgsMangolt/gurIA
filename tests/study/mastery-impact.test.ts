import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Concept } from '@/lib/study/domain';
import { compareMastery, legacyMastered } from '@/lib/study/mastery-impact';

const DAY = 86400000;
const t = new Date(2026, 10, 2, 12).getTime();
const att = (day: number, kind: Concept['attempts'][number]['kind'], correct = true) => ({
  at: t + day * DAY,
  correct,
  kind,
  score: Number(correct),
  helped: false,
});
const concept = (label: string, attempts: Concept['attempts']): Concept => ({
  id: label,
  label,
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts,
  exercises: [],
  due: 0,
});

describe('relatório de impacto do domínio', () => {
  it('legacyMastered reproduz a regra antiga', () => {
    expect(
      legacyMastered(concept('x', [att(0, 'choice'), att(1, 'choice'), att(2, 'application')])),
    ).toBe(true);
    expect(legacyMastered(concept('x', [att(0, 'choice'), att(1, 'application')]))).toBe(false);
    expect(
      legacyMastered(concept('x', [att(0, 'choice'), att(1, 'choice'), att(2, 'choice')])),
    ).toBe(false);
  });
  it('compareMastery conta quem perde e quem ganha domínio', () => {
    const perde = concept('perde', [att(0, 'choice'), att(1, 'choice'), att(2, 'application')]);
    const ganha = concept('ganha', [att(0, 'write'), att(3, 'write'), att(4, 'choice', false)]);
    const igual = concept('igual', []);
    expect(compareMastery([perde, ganha, igual])).toEqual({
      total: 3,
      before: 1,
      after: 1,
      lost: ['perde'],
      gained: ['ganha'],
    });
  });
  it('o guia explica a regra nova', () => {
    const guide = readFileSync('docs/guia/estudos.md', 'utf8');
    expect(guide).toContain('duas demonstrações sem sua ajuda');
    expect(guide).toContain('3 dias');
    expect(guide).not.toContain('três dias distintos');
  });
  it('o texto do conceito descreve a regra nova', () => {
    const app = readFileSync('components/study/StudyApp.tsx', 'utf8');
    expect(app).toContain('evidências sem ajuda');
    expect(app).not.toContain('exige revisão espaçada e aplicação');
  });
  it('o guia explica respostas pendentes', () => {
    const guide = readFileSync('docs/guia/estudos.md', 'utf8');
    expect(guide).toContain('pendente de correção');
    expect(guide).toContain('nunca troca de provedor');
  });
  it('o guia explica os modos', () => {
    const guide = readFileSync('docs/guia/estudos.md', 'utf8');
    for (const term of [
      'Rápido',
      'Aprofundar',
      'Prova',
      'Revisão espaçada',
      'prazo',
      'modo é definido pela sessão',
    ])
      expect(guide).toContain(term);
  });
  it('o guia explica a aba Praticar', () => {
    const guide = readFileSync('docs/guia/estudos.md', 'utf8');
    for (const term of [
      'Praticar',
      'Corrigir agora',
      'confirmação de custo',
      'Respostas pendentes',
    ])
      expect(guide).toContain(term);
  });
});
