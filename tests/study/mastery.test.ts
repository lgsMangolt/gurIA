import { describe, expect, it } from 'vitest';
import {
  MASTERY_MIN_EVIDENCE,
  MASTERY_MIN_GAP_DAYS,
  mastery,
  retryAfterFeedback,
  recordAnswer,
  type AttemptExtra,
  type AttemptKind,
  type Concept,
} from '@/lib/study/domain';

const base: Concept = {
  id: 'm',
  label: 'Lógica',
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [],
  due: 0,
};
// Datas em horário local, para o teste não depender do fuso da máquina.
const d = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 10, 1 + day, hour, minute).getTime();
const add = (
  n: Concept,
  day: number,
  kind: AttemptKind,
  correct = true,
  extra: AttemptExtra = {},
) => recordAnswer(n, correct, kind, Number(correct), d(day), undefined, extra);

describe('regra de domínio', () => {
  it('os limites ficam em constantes', () => {
    expect(MASTERY_MIN_EVIDENCE).toBe(2);
    expect(MASTERY_MIN_GAP_DAYS).toBe(3);
  });
  it('só escolha nunca domina, mesmo em muitos dias', () => {
    let n = base;
    for (let day = 0; day < 5; day++) n = add(n, day, 'choice');
    const m = mastery(n);
    expect(m.mastered).toBe(false);
    expect(m.fraction).toBeLessThanOrEqual(0.3);
  });
  it('duas evidências sem ajuda com 3 dias de intervalo dominam', () => {
    expect(mastery(add(add(base, 0, 'write'), 3, 'write')).mastered).toBe(true);
  });
  it('duas evidências com menos de 3 dias não dominam', () => {
    expect(mastery(add(add(base, 0, 'write'), 2, 'write')).mastered).toBe(false);
  });
  it('duas evidências no mesmo dia não dominam', () => {
    expect(mastery(add(add(base, 0, 'draw'), 0, 'draw')).mastered).toBe(false);
  });
  it('evidência com ajuda não conta', () => {
    const n = add(add(base, 0, 'write', true, { helped: true }), 3, 'write');
    expect(mastery(n).mastered).toBe(false);
    expect(mastery(n).evidenceCount).toBe(1);
  });
  it('application e explanation antigos contam como evidência', () => {
    expect(mastery(add(add(base, 0, 'application'), 3, 'explanation')).mastered).toBe(true);
  });
  it('erro em revisão espaçada retira o domínio e exige duas evidências novas', () => {
    let n = add(add(base, 0, 'write'), 3, 'write');
    expect(mastery(n).mastered).toBe(true);
    n = add(n, 10, 'choice', false, { mode: 'revisao' });
    expect(mastery(n).mastered).toBe(false);
    n = add(add(n, 11, 'write'), 14, 'write');
    expect(mastery(n).mastered).toBe(true);
  });
  it('erro fora de revisão espaçada não retira o domínio', () => {
    let n = add(add(base, 0, 'write'), 3, 'write');
    n = add(n, 10, 'choice', false, { mode: 'prova' });
    expect(mastery(n).mastered).toBe(true);
  });
  it('a diferença é em dias de calendário local', () => {
    const a = new Date(2026, 10, 3, 23, 50).getTime();
    const b = new Date(2026, 10, 6, 0, 10).getTime();
    const n = recordAnswer(recordAnswer(base, true, 'write', 1, a), true, 'write', 1, b);
    expect(mastery(n).mastered).toBe(true);
  });
  it('sem tentativas, nada', () => {
    const m = mastery(base);
    expect(m.fraction).toBe(0);
    expect(m.mastered).toBe(false);
  });
});

describe('achados da revisão final', () => {
  it('acerto no modo rápido tem peso baixo e não conta como evidência', () => {
    const n = add(add(base, 0, 'write', true, { mode: 'rapido' }), 3, 'write', true, {
      mode: 'rapido',
    });
    expect(mastery(n).mastered).toBe(false);
    expect(mastery(n).evidenceCount).toBe(0);
  });
  it('nova tentativa logo após ver o feedback de um erro conta como ajudada', () => {
    const failed = recordAnswer(base, false, 'application', 0.3, d(0));
    expect(retryAfterFeedback(failed, 'application', d(0, 12, 20))).toBe(true);
    expect(retryAfterFeedback(failed, 'application', d(1))).toBe(false);
    expect(retryAfterFeedback(base, 'application', d(0))).toBe(false);
    const ok = recordAnswer(base, true, 'application', 1, d(0));
    expect(retryAfterFeedback(ok, 'application', d(0, 12, 20))).toBe(false);
  });
});
