import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace, mastery, type Concept, type Workspace } from '@/lib/study/domain';
import type { Store } from '@/lib/study/exercises/submission-service';
import { AppError } from '@/lib/study/runtime/analysis';
import { PROVA_TOLERANCE_MS, SESSION_IDLE_MS } from '@/lib/study/sessions/session';
import {
  answerInSession,
  finishAndSummarize,
  getSession,
  gradeSession,
  startStudySession,
} from '@/lib/study/sessions/session-service';

const T0 = new Date(2026, 10, 10, 12).getTime();
const DAY = 86400000;
const MIN = 60000;
const rubric = [
  { criterion: 'a', weight: 1 },
  { criterion: 'b', weight: 1 },
];
const choice = (id: string) => ({
  type: 'escolha' as const,
  id,
  prompt: 'p',
  options: ['a', 'b', 'c'],
  answerIndexes: [0],
  explanation: '',
});
const writing = (id: string) => ({
  type: 'escrita' as const,
  id,
  prompt: 'p',
  rubric,
  minChars: 0,
});
const concept = (
  id: string,
  exercises: Concept['exercises'],
  over: Partial<Concept> = {},
): Concept => ({
  id,
  label: id,
  summary: 's',
  note: 'n',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [{ at: T0 - 5 * DAY, correct: true, kind: 'choice', score: 1, helped: false }],
  due: T0 - DAY,
  exercises,
  ...over,
});
const base = (): Workspace => ({
  ...emptyWorkspace(),
  concepts: [concept('c1', [choice('c1-e')]), concept('c2', [choice('c2-e'), writing('c2-w')])],
});

function memoryStore(initial = base()) {
  const state = { revision: 1, data: initial, saves: 0, log: [] as string[] };
  const store: Store = {
    load: async () => ({ revision: state.revision, data: state.data }),
    save: async (revision, data) => {
      if (revision !== state.revision) throw new AppError(409, 'REVISION_CONFLICT', 'conflito');
      state.revision++;
      state.saves++;
      state.log.push(
        data.studySessions
          .map((x) => x.items.filter((i) => i.answeredAt !== undefined).length)
          .join(',') +
          '|' +
          data.concepts.reduce((n, c) => n + c.attempts.length, 0),
      );
      state.data = data;
      return { revision: state.revision, data };
    },
  };
  return { store, state };
}
const ok = JSON.stringify({
  criteria: [
    { index: 0, score: 1, comment: 'a' },
    { index: 1, score: 1, comment: 'b' },
  ],
  feedback: 'bom',
  missing: [],
});
function setup(initial = base(), generate = vi.fn().mockResolvedValue(ok)) {
  const m = memoryStore(initial);
  const clock = { now: T0 };
  const deps = { store: m.store, generate, now: () => clock.now };
  return { ...m, clock, deps, generate };
}
const answerChoice = (
  sessionId: string,
  conceptId: string,
  exerciseId: string,
  chosen: number[],
  id = 'a-' + exerciseId,
) => ({
  sessionId,
  answer: {
    id,
    conceptId,
    exerciseId,
    harness: 'codex' as const,
    answer: { type: 'escolha' as const, chosen },
  },
});
const answerWriting = (
  sessionId: string,
  conceptId: string,
  exerciseId: string,
  text: string,
  id = 'a-' + exerciseId,
) => ({
  sessionId,
  answer: {
    id,
    conceptId,
    exerciseId,
    harness: 'codex' as const,
    answer: { type: 'escrita' as const, text },
  },
});
const code = (c: string) => expect.objectContaining({ code: c });

describe('sessões: início e resposta', () => {
  it('rapido: responder escolha registra a tentativa com mode rapido e a sessão, e devolve o resultado na hora', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, { id: 's1', mode: 'rapido' });
    expect(session.items.length).toBeGreaterThan(0);
    const item = session.items[0];
    const out = await answerInSession(
      deps,
      answerChoice('s1', item.conceptId, item.exerciseId, [0]),
    );
    expect(out.result).toMatchObject({ correct: true });
    const attempt = state.data.concepts.find((c) => c.id === item.conceptId)!.attempts.at(-1)!;
    expect(attempt).toMatchObject({ mode: 'rapido', sessionId: 's1', kind: 'choice' });
    expect(state.data.studySessions[0].items[0].answeredAt).toBe(T0);
  });
  it('o modo e o sessionId do corpo são ignorados', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, { id: 's1', mode: 'rapido' });
    const item = session.items[0];
    const body: any = answerChoice('s1', item.conceptId, item.exerciseId, [0]);
    body.answer.mode = 'revisao';
    body.answer.sessionId = 'outra';
    body.answer.deferGrading = true;
    await answerInSession(deps, body);
    const attempt = state.data.concepts.find((c) => c.id === item.conceptId)!.attempts.at(-1)!;
    expect(attempt).toMatchObject({ mode: 'rapido', sessionId: 's1' });
  });
  it('item repetido, item de outra sessão e conceito de fora são recusados e a tentativa não é gravada', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, { id: 's1', mode: 'rapido' });
    const item = session.items[0];
    await answerInSession(deps, answerChoice('s1', item.conceptId, item.exerciseId, [0]));
    const before = state.data.concepts.flatMap((c) => c.attempts).length;
    await expect(
      answerInSession(deps, answerChoice('s1', item.conceptId, item.exerciseId, [0], 'outro-id')),
    ).rejects.toMatchObject({ code: 'ITEM_JA_RESPONDIDO' });
    await expect(
      answerInSession(deps, answerChoice('s1', 'zz', 'zz-e', [0])),
    ).rejects.toMatchObject({
      code: 'ITEM_FORA_DA_SESSAO',
    });
    await expect(
      answerInSession(deps, answerChoice('nao', item.conceptId, item.exerciseId, [0])),
    ).rejects.toMatchObject({ code: 'SESSAO_INEXISTENTE' });
    expect(state.data.concepts.flatMap((c) => c.attempts)).toHaveLength(before);
  });
  it('resposta inválida não deixa o item marcado como respondido', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, {
      id: 's1',
      mode: 'aprofundar',
      conceptIds: ['c2'],
    });
    const item = session.items.find((i) => i.exerciseId === 'c2-w')!;
    await expect(
      answerInSession(deps, answerWriting('s1', 'c2', item.exerciseId, '   ')),
    ).rejects.toMatchObject({
      code: 'RESPOSTA_INVALIDA',
    });
    expect(
      state.data.studySessions[0].items.find((i) => i.exerciseId === 'c2-w')!.answeredAt,
    ).toBeUndefined();
    const retry = await answerInSession(
      deps,
      answerWriting('s1', 'c2', 'c2-w', 'Uma boa resposta.'),
    );
    expect(retry.state).toBe('corrigida');
  });
  it('iniciar com sessão ativa dá SESSAO_ATIVA; sem exercícios elegíveis dá SEM_EXERCICIOS e nada é salvo', async () => {
    const { deps, state } = setup();
    await startStudySession(deps, { id: 's1', mode: 'rapido' });
    await expect(startStudySession(deps, { id: 's2', mode: 'rapido' })).rejects.toMatchObject({
      code: 'SESSAO_ATIVA',
    });
    const empty = setup({ ...emptyWorkspace(), concepts: [concept('x', [])] });
    await expect(startStudySession(empty.deps, { id: 's', mode: 'rapido' })).rejects.toMatchObject({
      code: 'SEM_EXERCICIOS',
    });
    expect(empty.state.saves).toBe(0);
    expect(state.data.studySessions).toHaveLength(1);
  });
  it('um erro em revisao derruba o domínio do conceito', async () => {
    const t = new Date(2026, 10, 1, 12).getTime();
    const mastered = concept('m', [choice('m-e')], {
      attempts: [
        { at: t, correct: true, kind: 'write', score: 1, helped: false },
        { at: t + 3 * DAY, correct: true, kind: 'write', score: 1, helped: false },
      ],
      due: T0 - DAY,
    });
    const { deps, state } = setup({ ...emptyWorkspace(), concepts: [mastered] });
    expect(mastery(mastered).mastered).toBe(true);
    await startStudySession(deps, { id: 'r', mode: 'revisao' });
    await answerInSession(deps, answerChoice('r', 'm', 'm-e', [1]));
    expect(mastery(state.data.concepts[0]).mastered).toBe(false);
  });
});

describe('sessões: Prova', () => {
  const prova = async (s = setup()) => {
    const { session } = await startStudySession(s.deps, {
      id: 'p',
      mode: 'prova',
      conceptIds: ['c1', 'c2'],
    });
    return { ...s, session };
  };
  it('aceita dentro do prazo, recusa depois de prazo + tolerância com PROVA_ENCERRADA e marca a sessão expirada', async () => {
    const { deps, clock, state, session } = await prova();
    const limit = session.deadlineAt!;
    clock.now = limit + PROVA_TOLERANCE_MS;
    await answerInSession(deps, answerChoice('p', 'c1', 'c1-e', [0]));
    clock.now = limit + PROVA_TOLERANCE_MS + 1;
    await expect(
      answerInSession(deps, answerWriting('p', 'c2', 'c2-w', 'Tarde demais.')),
    ).rejects.toMatchObject({ code: 'PROVA_ENCERRADA' });
    expect(state.data.studySessions[0].state).toBe('expirada');
    expect(state.data.submissions).toHaveLength(0);
  });
  it('nenhum resultado aparece antes do fim, nem o de escolha local, mas a tentativa já foi registrada', async () => {
    const { deps, state } = await prova();
    const out = await answerInSession(deps, answerChoice('p', 'c1', 'c1-e', [0]));
    expect(out.result).toBeUndefined();
    expect(state.data.concepts[0].attempts.at(-1)).toMatchObject({ mode: 'prova', sessionId: 'p' });
    const done = await finishAndSummarize(deps, { sessionId: 'p' });
    expect(done.session.state).toBe('encerrada');
    expect(done.summary).toMatchObject({ total: 2, answered: 1, correct: 1 });
  });
  it('escrita fica pendente sem chamar a IA até gradeSession, e cota esgotada deixa o resto pendente', async () => {
    const generate = vi.fn().mockRejectedValue({ status: 429, message: 'quota' });
    const s = setup(base(), generate);
    await prova(s);
    const out = await answerInSession(s.deps, answerWriting('p', 'c2', 'c2-w', 'Minha resposta.'));
    expect(out.state).toBe('pendente');
    expect(generate).not.toHaveBeenCalled();
    const fin = await finishAndSummarize(s.deps, { sessionId: 'p' });
    expect(fin.estimate).toMatchObject({ writings: 1, total: 1 });
    const graded = await gradeSession(s.deps, { sessionId: 'p', harness: 'codex' });
    expect(graded).toMatchObject({ graded: 0, pending: 1, stoppedBy: 'QUOTA_EXCEEDED' });
    generate.mockReset().mockResolvedValue(ok);
    expect(await gradeSession(s.deps, { sessionId: 'p', harness: 'codex' })).toMatchObject({
      graded: 1,
      pending: 0,
    });
    expect(s.state.data.concepts[1].attempts.at(-1)).toMatchObject({
      kind: 'write',
      mode: 'prova',
      sessionId: 'p',
    });
  });
  it('gradeSession recusa sessão ainda ativa e só corrige envios daquela sessão', async () => {
    const s = setup();
    await prova(s);
    await answerInSession(s.deps, answerWriting('p', 'c2', 'c2-w', 'Minha resposta.'));
    await expect(gradeSession(s.deps, { sessionId: 'p', harness: 'codex' })).rejects.toMatchObject({
      code: 'SESSAO_ATIVA_NAO_CORRIGE',
    });
    // um envio de fora da sessão também está pendente
    const { submitExercise } = await import('@/lib/study/exercises/submission-service');
    await finishAndSummarize(s.deps, { sessionId: 'p' });
    await submitExercise(s.deps, {
      id: 'fora',
      conceptId: 'c2',
      exerciseId: 'c2-w',
      harness: 'codex',
      answer: { type: 'escrita', text: 'Fora da sessão.' },
      deferGrading: true,
    });
    await gradeSession(s.deps, { sessionId: 'p', harness: 'codex' });
    expect(s.generate).toHaveBeenCalledTimes(1);
    expect(s.state.data.submissions.find((x) => x.id === 'fora')!.state).toBe('pendente');
  });
});

describe('getSession', () => {
  it('expira sessão esquecida e persiste', async () => {
    const s = setup();
    await startStudySession(s.deps, { id: 's1', mode: 'rapido' });
    s.clock.now = T0 + SESSION_IDLE_MS + MIN;
    const got = await getSession(s.deps, { sessionId: 's1' });
    expect(got.state).toBe('expirada');
    expect(s.state.data.studySessions[0].state).toBe('expirada');
    await expect(getSession(s.deps, { sessionId: 'nao' })).rejects.toBeInstanceOf(AppError);
  });
});

describe('achados da revisão final', () => {
  it('dois envios simultâneos do mesmo item gravam uma única resposta', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, { id: 's1', mode: 'rapido' });
    const item = session.items[0];
    const before = state.data.concepts.flatMap((c) => c.attempts).length;
    const results = await Promise.allSettled([
      answerInSession(deps, answerChoice('s1', item.conceptId, item.exerciseId, [0], 'a')),
      answerInSession(deps, answerChoice('s1', item.conceptId, item.exerciseId, [0], 'b')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'ITEM_JA_RESPONDIDO' }),
    });
    expect(state.data.concepts.flatMap((c) => c.attempts)).toHaveLength(before + 1);
  });
  it('o carimbo é gravado antes da resposta, então encerrar no meio nunca deixa resposta sem carimbo', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, { id: 's1', mode: 'rapido' });
    const item = session.items[0];
    state.log.length = 0;
    await answerInSession(deps, answerChoice('s1', item.conceptId, item.exerciseId, [0]));
    const attemptsBefore = state.log[0].split('|')[1];
    expect(state.log[0].split('|')[0]).toBe('1'); // primeiro save: carimbo
    expect(state.log[1].split('|')[1]).toBe(String(Number(attemptsBefore) + 1)); // depois: tentativa
  });
  it('se a resposta falha, o carimbo é desfeito e o item pode ser respondido de novo', async () => {
    const { deps, state } = setup();
    const { session } = await startStudySession(deps, {
      id: 's1',
      mode: 'aprofundar',
      conceptIds: ['c2'],
    });
    await expect(
      answerInSession(deps, answerWriting('s1', 'c2', 'c2-w', '  ')),
    ).rejects.toMatchObject({
      code: 'RESPOSTA_INVALIDA',
    });
    expect(session.items.length).toBeGreaterThan(0);
    expect(state.data.studySessions[0].items.every((i) => i.answeredAt === undefined)).toBe(true);
  });
  it('o lote e o reenvio genéricos não corrigem envios de uma Prova ainda ativa', async () => {
    const generate = vi.fn().mockResolvedValue(ok);
    const s = setup(base(), generate);
    await startStudySession(s.deps, { id: 'p', mode: 'prova', conceptIds: ['c1', 'c2'] });
    await answerInSession(s.deps, answerWriting('p', 'c2', 'c2-w', 'Minha resposta.'));
    const { gradePendingBatch, regradeSubmission } =
      await import('@/lib/study/exercises/submission-service');
    const batch = await gradePendingBatch(s.deps, { harness: 'codex' });
    expect(batch).toMatchObject({ graded: 0 });
    expect(generate).not.toHaveBeenCalled();
    await expect(
      regradeSubmission(s.deps, { id: 'a-c2-w', harness: 'codex' }),
    ).rejects.toMatchObject({ code: 'SESSAO_ATIVA_NAO_CORRIGE' });
    await finishAndSummarize(s.deps, { sessionId: 'p' });
    expect(await gradePendingBatch(s.deps, { harness: 'codex' })).toMatchObject({ graded: 1 });
  });
});
