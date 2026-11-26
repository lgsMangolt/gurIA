import { describe, expect, it } from 'vitest';
import {
  emptyWorkspace,
  mastery,
  workspaceSchema,
  studyModes,
  type Workspace,
} from '@/lib/study/domain';
import { submissionModes } from '@/lib/study/exercises/submissions-schema';
import {
  GRADE_PASS_SCORE,
  KEEP_GRADED,
  MAX_GRADE_TRIES,
  MAX_PENDING_DRAWINGS,
  MAX_QUEUED,
  removeSubmission,
  markFailed,
  markGraded,
  pruneSubmissions,
  queueSubmission,
  resetForRetry,
} from '@/lib/study/exercises/submissions';
import { buildDemoWorkspace } from '../../scripts/readme-demo/fixture';

const rubric = [
  { criterion: 'Define', weight: 1 },
  { criterion: 'Exemplo', weight: 1 },
];
const png = 'data:image/png;base64,iVBORw0KGgo=';
const base = (): Workspace => ({
  ...emptyWorkspace(),
  concepts: [
    {
      id: 'c1',
      label: 'Conceito',
      summary: '',
      note: '',
      origin: 'manual',
      courseIds: [],
      evidence: [],
      attempts: [],
      due: 0,
      exercises: [
        { type: 'escrita', id: 'w1', prompt: 'Explique', rubric, minChars: 0 },
        { type: 'desenho', id: 'd1', prompt: 'Desenhe', rubric },
      ],
    },
  ],
});
const writing = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conceptId: 'c1',
  exerciseId: 'w1',
  createdAt: 1000,
  answer: { type: 'escrita' as const, text: 'minha resposta' },
  ...extra,
});
const drawing = (id: string) => ({
  id,
  conceptId: 'c1',
  exerciseId: 'd1',
  createdAt: 1000,
  answer: { type: 'desenho' as const, image: png },
});
const good = {
  score: 1,
  correct: true,
  feedback: 'ok',
  missing: [],
  criteria: [{ criterion: 'Define', score: 1, comment: '' }],
};
const err = { code: 'QUOTA_EXCEEDED', message: 'cota' };

describe('fila de envios', () => {
  it('os modos do schema acompanham os modos do domínio', () => {
    expect([...submissionModes]).toEqual([...studyModes]);
  });
  it('queueSubmission guarda pendente e é idempotente por id', () => {
    const once = queueSubmission(base(), writing('s1'));
    expect(once.submissions[0]).toMatchObject({
      id: 's1',
      state: 'pendente',
      tries: 0,
      helped: false,
    });
    expect(queueSubmission(once, writing('s1')).submissions).toHaveLength(1);
  });
  it('queueSubmission recusa conceito inexistente, exercício inexistente e tipo diferente', () => {
    expect(() => queueSubmission(base(), writing('s', { conceptId: 'x' }))).toThrow(/inexistente/i);
    expect(() => queueSubmission(base(), writing('s', { exerciseId: 'x' }))).toThrow(
      /inexistente/i,
    );
    expect(() => queueSubmission(base(), { ...drawing('s'), exerciseId: 'w1' })).toThrow(/tipo/i);
  });
  it('a fila recusa o 11º desenho pendente com FILA_CHEIA, mas aceita escrita', () => {
    let ws = base();
    for (let i = 0; i < MAX_PENDING_DRAWINGS; i++) ws = queueSubmission(ws, drawing('d' + i));
    expect(() => queueSubmission(ws, drawing('extra'))).toThrow(
      expect.objectContaining({ code: 'FILA_CHEIA' }),
    );
    expect(queueSubmission(ws, writing('w')).submissions).toHaveLength(MAX_PENDING_DRAWINGS + 1);
  });
  it('markFailed vira falhou na terceira tentativa e imediatamente para código não repetível', () => {
    let ws = queueSubmission(base(), writing('s1'));
    for (let i = 1; i < MAX_GRADE_TRIES; i++) {
      ws = markFailed(ws, 's1', err);
      expect(ws.submissions[0]).toMatchObject({ state: 'pendente', tries: i, lastError: err });
    }
    expect(markFailed(ws, 's1', err).submissions[0].state).toBe('falhou');
    const fresh = queueSubmission(base(), writing('s2'));
    const hard = markFailed(fresh, 's2', { code: 'INVALID_API_KEY', message: 'x' });
    expect(hard.submissions[0].state).toBe('falhou');
  });
  it('markFailed não altera envio corrigido', () => {
    const ws = markGraded(queueSubmission(base(), writing('s1')), 's1', good, 5000);
    expect(markFailed(ws, 's1', err)).toEqual(ws);
  });
  it('markGraded registra a tentativa uma vez, com modo, ajuda, confiança e sessão, e apaga a imagem', () => {
    let ws = queueSubmission(base(), {
      ...drawing('s1'),
      mode: 'aprofundar',
      helped: false,
      confidence: 0.6,
      sessionId: 'sess',
    });
    ws = markGraded(ws, 's1', good, 5000);
    ws = markGraded(ws, 's1', good, 6000);
    const c = ws.concepts[0];
    expect(c.attempts).toHaveLength(1);
    expect(c.attempts[0]).toMatchObject({
      kind: 'draw',
      correct: true,
      score: 1,
      mode: 'aprofundar',
      helped: false,
      confidence: 0.6,
      sessionId: 'sess',
      sourceId: 'submission:s1',
    });
    expect(ws.submissions[0]).toMatchObject({ state: 'corrigida', gradedAt: 5000 });
    expect(ws.submissions[0].answer).toEqual({ type: 'desenho' });
  });
  it('markGraded com erro em revisão derruba o domínio', () => {
    const day = 86400000;
    const t = new Date(2026, 10, 2, 12).getTime();
    let ws = base();
    ws = {
      ...ws,
      concepts: [
        {
          ...ws.concepts[0],
          attempts: [
            { at: t, correct: true, kind: 'write', score: 1, helped: false },
            { at: t + 3 * day, correct: true, kind: 'write', score: 1, helped: false },
          ],
        },
      ],
    };
    expect(mastery(ws.concepts[0]).mastered).toBe(true);
    ws = queueSubmission(ws, writing('s1', { mode: 'revisao' }));
    ws = markGraded(ws, 's1', { ...good, score: 0.2, correct: false }, t + 10 * day);
    expect(mastery(ws.concepts[0]).mastered).toBe(false);
  });
  it('resetForRetry zera tries e erro', () => {
    let ws = queueSubmission(base(), writing('s1'));
    for (let i = 0; i < MAX_GRADE_TRIES; i++) ws = markFailed(ws, 's1', err);
    expect(ws.submissions[0].state).toBe('falhou');
    const back = resetForRetry(ws, 's1').submissions[0];
    expect(back).toMatchObject({ state: 'pendente', tries: 0 });
    expect(back.lastError).toBeUndefined();
  });
  it('pruneSubmissions mantém não corrigidos e só os 100 corrigidos mais recentes', () => {
    const make = (i: number, state: 'corrigida' | 'pendente') => ({
      ...writing('s' + i),
      createdAt: i,
      helped: false,
      state,
      tries: 0,
      ...(state === 'corrigida' ? { gradedAt: i, result: good } : {}),
    });
    const ws: Workspace = {
      ...base(),
      submissions: [
        ...Array.from({ length: KEEP_GRADED + 20 }, (_, i) => make(i, 'corrigida')),
        make(9999, 'pendente'),
      ],
    };
    const pruned = pruneSubmissions(ws).submissions;
    expect(pruned.filter((s) => s.state === 'corrigida')).toHaveLength(KEEP_GRADED);
    expect(pruned.some((s) => s.id === 's9999')).toBe(true);
    expect(pruned.some((s) => s.id === 's0')).toBe(false);
    expect(GRADE_PASS_SCORE).toBe(0.8);
  });
  it('workspace antigo sem submissions continua válido', () => {
    expect(workspaceSchema.parse(buildDemoWorkspace()).submissions).toEqual([]);
  });
});

describe('limite total da fila', () => {
  it('recusa com FILA_CHEIA quando há envios não corrigidos demais, em vez de estourar o schema', () => {
    let ws = base();
    for (let i = 0; i < MAX_QUEUED; i++) ws = queueSubmission(ws, writing('q' + i));
    expect(() => queueSubmission(ws, writing('extra'))).toThrow(
      expect.objectContaining({ code: 'FILA_CHEIA' }),
    );
    expect(() => workspaceSchema.parse(ws)).not.toThrow();
  });
  it('removeSubmission tira pendente e falhou, mas não corrigido', () => {
    let ws = queueSubmission(base(), writing('s1'));
    expect(removeSubmission(ws, 's1').submissions).toEqual([]);
    ws = markGraded(ws, 's1', good, 5000);
    expect(() => removeSubmission(ws, 's1')).toThrow(
      expect.objectContaining({ code: 'JA_CORRIGIDA' }),
    );
    expect(() => removeSubmission(ws, 'zz')).toThrow(expect.objectContaining({ status: 404 }));
  });
});
