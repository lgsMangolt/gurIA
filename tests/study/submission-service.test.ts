import { describe, expect, it, vi } from 'vitest';
import { emptyWorkspace, type Workspace } from '@/lib/study/domain';
import { AppError } from '@/lib/study/runtime/analysis';
import {
  discardSubmission,
  estimateBatch,
  gradePendingBatch,
  regradeSubmission,
  submitExercise,
  type Store,
  type SubmitInput,
} from '@/lib/study/exercises/submission-service';
import { GRADE_BATCH_LIMIT } from '@/lib/study/exercises/submission-service';

const rubric = [
  { criterion: 'Define', weight: 1 },
  { criterion: 'Exemplo', weight: 1 },
];
const png = 'data:image/png;base64,iVBORw0KGgo=';
const NOW = new Date(2026, 10, 10, 12).getTime();

const workspace = (): Workspace => ({
  ...emptyWorkspace(),
  concepts: [
    {
      id: 'c1',
      label: 'Conceito',
      summary: 's',
      note: 'n',
      origin: 'manual',
      courseIds: [],
      evidence: [],
      attempts: [],
      due: 0,
      exercises: [
        {
          type: 'escolha',
          id: 'e1',
          prompt: 'p',
          options: ['a', 'b', 'c'],
          answerIndexes: [1],
          explanation: '',
        },
        {
          type: 'ligar',
          id: 'l1',
          prompt: 'p',
          pairs: [
            { left: 'a', right: '1' },
            { left: 'b', right: '2' },
          ],
        },
        { type: 'escrita', id: 'w1', prompt: 'Explique', rubric, minChars: 0 },
        { type: 'desenho', id: 'd1', prompt: 'Desenhe', rubric },
      ],
    },
  ],
});

function memoryStore(initial = workspace(), conflicts = 0) {
  const state = { revision: 1, data: initial, conflicts, log: [] as string[] };
  const store: Store = {
    load: async () => ({ revision: state.revision, data: state.data }),
    save: async (revision, data) => {
      if (state.conflicts > 0) {
        state.conflicts--;
        throw new AppError(409, 'REVISION_CONFLICT', 'conflito');
      }
      expect(revision).toBe(state.revision);
      state.revision++;
      state.data = data;
      state.log.push('save:' + data.submissions.map((s) => s.state).join(','));
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
const writingInput = (id: string, extra: Partial<SubmitInput> = {}): SubmitInput => ({
  id,
  conceptId: 'c1',
  exerciseId: 'w1',
  harness: 'codex',
  answer: { type: 'escrita', text: 'Uma resposta razoável.' },
  ...extra,
});
const deps = (store: Store, generate: ReturnType<typeof vi.fn>) => ({
  store,
  generate,
  now: () => NOW,
});

describe('submitExercise', () => {
  it('escolha e ligar são corrigidas localmente, registram a tentativa e não chamam a IA', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn();
    const a = await submitExercise(deps(store, generate), {
      id: 'x1',
      conceptId: 'c1',
      exerciseId: 'e1',
      harness: 'codex',
      answer: { type: 'escolha', chosen: [1] },
      mode: 'aprofundar',
    });
    expect(a.state).toBe('corrigida');
    const b = await submitExercise(deps(store, generate), {
      id: 'x2',
      conceptId: 'c1',
      exerciseId: 'l1',
      harness: 'codex',
      answer: { type: 'ligar', matches: { a: '1', b: '1' } },
    });
    expect(b.result).toMatchObject({ correct: false, score: 0.5 });
    const attempts = state.data.concepts[0].attempts;
    expect(attempts.map((t) => t.kind)).toEqual(['choice', 'connect']);
    expect(attempts[0]).toMatchObject({ mode: 'aprofundar', sourceId: 'submission:x1' });
    expect(generate).not.toHaveBeenCalled();
    expect(state.data.submissions).toEqual([]);
    // reenviar o mesmo id não duplica
    await submitExercise(deps(store, generate), {
      id: 'x1',
      conceptId: 'c1',
      exerciseId: 'e1',
      harness: 'codex',
      answer: { type: 'escolha', chosen: [1] },
    });
    expect(state.data.concepts[0].attempts).toHaveLength(2);
  });
  it('escrita corrigida: salva pendente antes da IA, depois corrigida, e registra uma tentativa com modo e sessão', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn().mockImplementation(async () => {
      state.log.push('generate');
      return ok;
    });
    const out = await submitExercise(
      deps(store, generate),
      writingInput('s1', { mode: 'aprofundar', sessionId: 'sess', confidence: 0.5 }),
    );
    expect(out).toMatchObject({ state: 'corrigida', result: { score: 1, correct: true } });
    expect(state.log).toEqual(['save:pendente', 'generate', 'save:corrigida']);
    const attempts = state.data.concepts[0].attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      kind: 'write',
      mode: 'aprofundar',
      sessionId: 'sess',
      confidence: 0.5,
      helped: false,
    });
  });
  it('quando a IA falha por cota a resposta fica pendente e nenhuma tentativa é registrada', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn().mockRejectedValue({ status: 429, message: 'quota' });
    const out = await submitExercise(deps(store, generate), writingInput('s1'));
    expect(out).toMatchObject({ state: 'pendente', error: { code: 'QUOTA_EXCEEDED' } });
    expect(state.data.submissions[0]).toMatchObject({ state: 'pendente', tries: 1 });
    expect(state.data.submissions[0].answer).toMatchObject({ text: 'Uma resposta razoável.' });
    expect(state.data.concepts[0].attempts).toHaveLength(0);
  });
  it('resposta inválida é recusada antes de salvar e antes da IA', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn();
    await expect(
      submitExercise(deps(store, generate), {
        ...writingInput('s1'),
        answer: { type: 'escrita', text: '   ' },
      }),
    ).rejects.toMatchObject({ code: 'RESPOSTA_INVALIDA' });
    await expect(
      submitExercise(deps(store, generate), {
        ...writingInput('s2'),
        exerciseId: 'd1',
        answer: { type: 'desenho', image: 'data:image/svg+xml;base64,AAAA' },
      }),
    ).rejects.toMatchObject({ code: 'RESPOSTA_INVALIDA' });
    expect(generate).not.toHaveBeenCalled();
    expect(state.log).toEqual([]);
  });
  it('deferGrading guarda sem chamar a IA', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn();
    const out = await submitExercise(
      deps(store, generate),
      writingInput('s1', { deferGrading: true }),
    );
    expect(out.state).toBe('pendente');
    expect(generate).not.toHaveBeenCalled();
    expect(state.data.submissions[0].tries).toBe(0);
  });
  it('retentativa logo após feedback sem helped explícito é marcada como ajudada', async () => {
    const initial = workspace();
    initial.concepts[0].attempts = [
      { at: NOW - 10 * 60000, correct: false, kind: 'write', score: 0.2, helped: false },
    ];
    const { store, state } = memoryStore(initial);
    await submitExercise(deps(store, vi.fn().mockResolvedValue(ok)), writingInput('s1'));
    expect(state.data.concepts[0].attempts.at(-1)).toMatchObject({ helped: true });
  });
  it('conflito de revisão ao gravar o resultado relê e reaplica uma vez', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn().mockImplementation(async () => {
      state.conflicts = 1; // o próximo save (resultado) conflita uma vez
      return ok;
    });
    const out = await submitExercise(deps(store, generate), writingInput('s1'));
    expect(out.state).toBe('corrigida');
    expect(state.data.concepts[0].attempts).toHaveLength(1);
  });
  it('se o conflito persistir, devolve pendente sem perder a resposta', async () => {
    const { store, state } = memoryStore();
    const generate = vi.fn().mockImplementation(async () => {
      state.conflicts = 99;
      return ok;
    });
    const out = await submitExercise(deps(store, generate), writingInput('s1'));
    expect(out).toMatchObject({ state: 'pendente', error: { code: 'REVISION_CONFLICT' } });
    expect(state.data.submissions[0]).toMatchObject({ state: 'pendente' });
    expect(state.data.concepts[0].attempts).toHaveLength(0);
  });
});

describe('regradeSubmission', () => {
  it('reenviar um pendente corrige sem duplicar a tentativa; reenviar corrigido dá JA_CORRIGIDA', async () => {
    const { store, state } = memoryStore();
    await submitExercise(
      deps(store, vi.fn().mockRejectedValue({ status: 429, message: 'quota' })),
      writingInput('s1'),
    );
    const generate = vi.fn().mockResolvedValue(ok);
    const out = await regradeSubmission(deps(store, generate), { id: 's1', harness: 'claude' });
    expect(out.state).toBe('corrigida');
    expect(generate.mock.calls[0][4]).toBe('claude');
    expect(state.data.concepts[0].attempts).toHaveLength(1);
    await expect(
      regradeSubmission(deps(store, generate), { id: 's1', harness: 'claude' }),
    ).rejects.toMatchObject({ code: 'JA_CORRIGIDA' });
    await expect(
      regradeSubmission(deps(store, generate), { id: 'nao', harness: 'claude' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('gradePendingBatch', () => {
  const queued = async (n: number) => {
    const m = memoryStore();
    for (let i = 0; i < n; i++)
      await submitExercise(deps(m.store, vi.fn()), writingInput('s' + i, { deferGrading: true }));
    return m;
  };
  it('o lote corrige em ordem, para no primeiro QUOTA_EXCEEDED e deixa o resto pendente', async () => {
    const { store } = await queued(5);
    const generate = vi
      .fn()
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce(ok)
      .mockRejectedValueOnce({ status: 429, message: 'quota' })
      .mockResolvedValue(ok);
    const out = await gradePendingBatch(deps(store, generate), { harness: 'codex' });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(out).toMatchObject({ graded: 2, pending: 3, failed: 0, stoppedBy: 'QUOTA_EXCEEDED' });
    expect(Object.keys(out.outcomes)).toEqual(['s0', 's1', 's2']);
  });
  it('o lote corrige no máximo 12 por vez', async () => {
    const { store } = await queued(GRADE_BATCH_LIMIT + 3);
    const generate = vi.fn().mockResolvedValue(ok);
    const out = await gradePendingBatch(deps(store, generate), { harness: 'codex' });
    expect(generate).toHaveBeenCalledTimes(GRADE_BATCH_LIMIT);
    expect(out).toMatchObject({ graded: GRADE_BATCH_LIMIT, pending: 3 });
    expect(out.stoppedBy).toBeUndefined();
  });
  it('um erro de resposta inválida da IA no lote marca só aquele item e segue', async () => {
    const { store, state } = await queued(3);
    const generate = vi.fn().mockResolvedValueOnce('lixo').mockResolvedValue(ok);
    const out = await gradePendingBatch(deps(store, generate), { harness: 'codex' });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(out).toMatchObject({ graded: 2, pending: 1, failed: 0 });
    expect(state.data.submissions[0]).toMatchObject({ state: 'pendente', tries: 1 });
  });
  it('só corrige os ids pedidos', async () => {
    const { store } = await queued(4);
    const generate = vi.fn().mockResolvedValue(ok);
    const out = await gradePendingBatch(deps(store, generate), {
      ids: ['s1', 's3'],
      harness: 'codex',
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(out.graded).toBe(2);
  });
});

describe('estimateBatch', () => {
  it('conta textos e desenhos pendentes e avisa quando passa do limite', async () => {
    const m = memoryStore();
    const d = deps(m.store, vi.fn());
    await submitExercise(d, writingInput('w1', { deferGrading: true }));
    await submitExercise(d, {
      ...writingInput('d1', { deferGrading: true }),
      exerciseId: 'd1',
      answer: { type: 'desenho', image: png },
    });
    expect(estimateBatch(m.state.data)).toEqual({
      writings: 1,
      drawings: 1,
      total: 2,
      overLimit: false,
    });
    expect(estimateBatch(m.state.data, ['d1'])).toMatchObject({ writings: 0, drawings: 1 });
    const many = {
      ...m.state.data,
      submissions: Array.from({ length: GRADE_BATCH_LIMIT + 1 }, (_, i) => ({
        ...m.state.data.submissions[0],
        id: 'x' + i,
      })),
    };
    expect(estimateBatch(many).overLimit).toBe(true);
  });
});

describe('achados da revisão final', () => {
  it.each([
    'LIMIT_UNKNOWN',
    'CREDITS_DISABLED',
    'MODEL_UNAVAILABLE',
    'CODEX_BUSY',
    'CODEX_STOPPED',
    'CODEX_TIMEOUT',
    'PROVIDER_TIMEOUT',
  ])('o lote para em %s e não gasta as demais chamadas', async (code) => {
    const m = memoryStore();
    for (let i = 0; i < 5; i++)
      await submitExercise(deps(m.store, vi.fn()), writingInput('s' + i, { deferGrading: true }));
    const generate = vi.fn().mockRejectedValue(new AppError(503, code, 'x'));
    const out = await gradePendingBatch(deps(m.store, generate), { harness: 'codex' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(out.stoppedBy).toBe(code);
  });
  it('descartar remove um envio pendente ou falhou, mas não um corrigido', async () => {
    const m = memoryStore();
    await submitExercise(deps(m.store, vi.fn()), writingInput('p', { deferGrading: true }));
    await submitExercise(deps(m.store, vi.fn().mockResolvedValue(ok)), writingInput('c'));
    await discardSubmission(deps(m.store, vi.fn()), { id: 'p' });
    expect(m.state.data.submissions.map((s) => s.id)).toEqual(['c']);
    await expect(discardSubmission(deps(m.store, vi.fn()), { id: 'c' })).rejects.toMatchObject({
      code: 'JA_CORRIGIDA',
    });
    await expect(discardSubmission(deps(m.store, vi.fn()), { id: 'nao' })).rejects.toMatchObject({
      status: 404,
    });
  });
});
