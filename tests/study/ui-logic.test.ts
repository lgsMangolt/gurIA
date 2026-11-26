import { describe, expect, it } from 'vitest';
import { GRADE_BATCH_LIMIT } from '@/lib/study/exercises/submission-service';
import type { StudySession } from '@/lib/study/sessions/session-schema';
import { BATCH_LIMIT, costNotice, MODE_LABELS, CONFIDENCE_LEVELS } from '@/lib/study/ui/copy';
import { confidenceValue } from '@/lib/study/ui/confidence';
import {
  addItem,
  clearDrawing,
  emptyDrawing,
  fitDataUrl,
  isBlank,
  MAX_DRAW_ITEMS,
  MAX_DRAW_POINTS,
  undo,
  type DrawItem,
} from '@/lib/study/ui/drawing';
import { friendlyError, KNOWN_ERROR_CODES } from '@/lib/study/ui/errors';
import { initMatch, matchComplete, matchReduce } from '@/lib/study/ui/match';
import { canRegrade, describePending, pendingActions } from '@/lib/study/ui/pending';
import {
  buildAnswerPayload,
  nextPendingIndex,
  nextUnansweredIndex,
  requiresCostConfirmation,
  shouldAutoFinish,
  sessionSummaryView,
} from '@/lib/study/ui/payload';
import type { Exercise } from '@/lib/study/exercises/schema';
import {
  clockSkew,
  formatRemaining,
  itemId,
  remainingMs,
  timerWarning,
} from '@/lib/study/ui/timer';

const prova = (deadlineAt: number): StudySession => ({
  id: 'p',
  mode: 'prova',
  state: 'ativa',
  startedAt: 0,
  deadlineAt,
  limitMinutes: 10,
  items: [{ conceptId: 'c', exerciseId: 'e' }],
});

describe('textos e erros', () => {
  it('friendlyError traduz os códigos conhecidos e usa o fallback para os desconhecidos', () => {
    expect(friendlyError('PROVA_ENCERRADA', 'x')).toMatch(/prazo/i);
    expect(friendlyError('ZZZ', 'original')).toBe('original');
    expect(friendlyError(undefined, 'original')).toBe('original');
  });
  it('todo código de erro das rotas 2B/2C tem mensagem', () => {
    for (const code of [
      'PROVA_ENCERRADA',
      'SESSAO_ENCERRADA',
      'ITEM_JA_RESPONDIDO',
      'SESSAO_ATIVA',
      'SEM_EXERCICIOS',
      'PROVA_SEM_CONCEITOS',
      'QUOTA_EXCEEDED',
      'SUBSCRIPTION_REQUIRED',
      'HARNESS_CHANGED',
      'FILA_CHEIA',
      'RESPOSTA_INVALIDA',
      'JA_CORRIGIDA',
      'REVISION_CONFLICT',
    ])
      expect(KNOWN_ERROR_CODES).toContain(code);
  });
  it('os quatro modos têm título e descrição, e o limite do lote acompanha o servidor', () => {
    expect(Object.keys(MODE_LABELS).sort()).toEqual(['aprofundar', 'prova', 'rapido', 'revisao']);
    expect(MODE_LABELS.revisao.title).toBe('Revisão espaçada');
    expect(BATCH_LIMIT).toBe(GRADE_BATCH_LIMIT);
  });
  it('confidenceValue devolve 0.25, 0.6 e 0.9 e undefined para id desconhecido', () => {
    expect(CONFIDENCE_LEVELS.map((l) => confidenceValue(l.id))).toEqual([0.25, 0.6, 0.9]);
    expect(confidenceValue('nada')).toBeUndefined();
  });
});

describe('cronômetro', () => {
  it('remainingMs usa o relógio do servidor', () => {
    const serverNow = 1_000_000;
    const clientNow = serverNow + 10 * 60000; // relógio do computador adiantado 10 min
    const skew = clockSkew(serverNow, clientNow);
    expect(skew).toBe(-600000);
    expect(remainingMs(prova(serverNow + 120000), clientNow, skew)).toBe(120000);
    expect(remainingMs(prova(serverNow + 120000), clientNow, 0)).toBe(0);
  });
  it('fora da Prova devolve null e nunca é negativo', () => {
    expect(remainingMs({ ...prova(10), mode: 'rapido' }, 0, 0)).toBeNull();
    expect(remainingMs(prova(10), 5000, 0)).toBe(0);
  });
  it('formatRemaining e timerWarning nos limites exatos', () => {
    expect(formatRemaining(65_000)).toBe('01:05');
    expect(formatRemaining(3_725_000)).toBe('1:02:05');
    expect(formatRemaining(0)).toBe('00:00');
    expect(timerWarning(300001)).toBe('ok');
    expect(timerWarning(300000)).toBe('cinco');
    expect(timerWarning(60000)).toBe('um');
    expect(timerWarning(0)).toBe('zero');
  });
  it('itemId é determinístico', () => {
    expect(itemId('s1', 3)).toBe('s1:3');
    expect(itemId('s1', 3)).toBe(itemId('s1', 3));
  });
});

describe('ligar', () => {
  const exercise = {
    id: 'l1',
    pairs: [
      { left: 'a', right: '1' },
      { left: 'b', right: '2' },
      { left: 'c', right: '3' },
    ],
  };
  it('initMatch embaralha os lados direitos de forma determinística e estável', () => {
    const one = initMatch(exercise, 's1');
    const two = initMatch(exercise, 's1');
    expect(one.rights).toEqual(two.rights);
    expect([...one.rights].sort()).toEqual(['1', '2', '3']);
    expect(one.rights).not.toEqual(['1', '2', '3']);
    for (const id of ['x', 'y', 'z', 'w'])
      expect(initMatch({ ...exercise, id }, 's').rights).not.toEqual(['1', '2', '3']);
  });
  it('matchReduce cria, move e desfaz pares', () => {
    let s = initMatch(exercise, 's1');
    s = matchReduce(s, { type: 'right', right: '1' }); // sem esquerdo escolhido: nada
    expect(s.matches).toEqual({});
    s = matchReduce(matchReduce(s, { type: 'left', left: 'a' }), { type: 'right', right: '1' });
    expect(s.matches).toEqual({ a: '1' });
    s = matchReduce(matchReduce(s, { type: 'left', left: 'b' }), { type: 'right', right: '1' });
    expect(s.matches).toEqual({ b: '1' }); // o direito usado por outro esquerdo foi movido
    s = matchReduce(s, { type: 'left', left: 'b' }); // clicar num esquerdo ligado desfaz
    expect(s.matches).toEqual({});
    s = matchReduce(matchReduce(s, { type: 'left', left: 'a' }), { type: 'right', right: '2' });
    expect(matchReduce(s, { type: 'clear' }).matches).toEqual({});
  });
  it('matchComplete só quando todos os esquerdos têm par', () => {
    let s = initMatch(exercise, 's1');
    for (const [l, r] of [
      ['a', '1'],
      ['b', '2'],
    ] as const)
      s = matchReduce(matchReduce(s, { type: 'left', left: l }), { type: 'right', right: r });
    expect(matchComplete(s, 3)).toBe(false);
    s = matchReduce(matchReduce(s, { type: 'left', left: 'c' }), { type: 'right', right: '3' });
    expect(matchComplete(s, 3)).toBe(true);
  });
});

describe('modelo do desenho', () => {
  const stroke = (n = 3): DrawItem => ({
    tool: 'pen',
    color: '#000',
    width: 2,
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  });
  it('addItem ignora item sem pontos e limita itens e pontos', () => {
    let doc = emptyDrawing();
    expect(addItem(doc, { ...stroke(), points: [] })).toBe(doc);
    doc = addItem(doc, stroke(MAX_DRAW_POINTS + 50));
    expect(doc.items[0].points).toHaveLength(MAX_DRAW_POINTS);
    let full = emptyDrawing();
    for (let i = 0; i < MAX_DRAW_ITEMS + 5; i++) full = addItem(full, stroke(1));
    expect(full.items).toHaveLength(MAX_DRAW_ITEMS);
  });
  it('undo e clear não mudam o original', () => {
    const doc = addItem(addItem(emptyDrawing(), stroke()), stroke());
    expect(undo(doc).items).toHaveLength(1);
    expect(doc.items).toHaveLength(2);
    expect(clearDrawing(doc).items).toEqual([]);
    expect(undo(emptyDrawing()).items).toEqual([]);
  });
  it('isBlank considera vazio e texto vazio', () => {
    expect(isBlank(emptyDrawing())).toBe(true);
    const textOnly = addItem(emptyDrawing(), { ...stroke(1), tool: 'text', text: '   ' });
    expect(isBlank(textOnly)).toBe(true);
    expect(isBlank(addItem(emptyDrawing(), { ...stroke(1), tool: 'text', text: 'oi' }))).toBe(
      false,
    );
    expect(isBlank(addItem(emptyDrawing(), stroke()))).toBe(false);
  });
  it('fitDataUrl escolhe o primeiro codificador que cabe e lança mensagem em português', () => {
    const big = () => 'x'.repeat(2000);
    const small = () => 'y'.repeat(10);
    expect(fitDataUrl([big, small], 1000)).toBe('yyyyyyyyyy');
    expect(fitDataUrl([small, big], 1000)).toBe('yyyyyyyyyy');
    expect(() => fitDataUrl([big, big], 1000)).toThrow(/grande demais/i);
  });
});

describe('pendências', () => {
  const item = (state: 'pendente' | 'falhou', code?: string) => ({
    id: 's1',
    conceptId: 'c',
    exerciseId: 'e',
    state,
    tries: 1,
    createdAt: 1,
    ...(code ? { lastError: { code, message: 'orig' } } : {}),
  });
  it('describePending lista estado e motivo em português e costNotice cita textos e desenhos', () => {
    const estimate = { writings: 2, drawings: 1, total: 3, overLimit: false };
    const view = describePending([item('pendente', 'QUOTA_EXCEEDED'), item('falhou')], estimate);
    expect(view.rows[0]).toMatchObject({ stateLabel: 'Pendente de correção' });
    expect(view.rows[0].detail).toMatch(/cota/i);
    expect(view.rows[1].stateLabel).toBe('Falhou');
    expect(view.notice).toContain('2 textos');
    expect(view.notice).toContain('1 desenho');
    expect(costNotice({ writings: 0, drawings: 0, total: 0, overLimit: false })).toBe('');
    expect(costNotice({ writings: 13, drawings: 0, total: 13, overLimit: true })).toMatch(/12/);
  });
  it('canRegrade só para pendente e falhou', () => {
    expect(canRegrade('pendente')).toBe(true);
    expect(canRegrade('falhou')).toBe(true);
    expect(canRegrade('corrigida')).toBe(false);
  });
});

describe('envio da resposta', () => {
  const rubric = [
    { criterion: 'a', weight: 1 },
    { criterion: 'b', weight: 1 },
  ];
  const escolha: Exercise = {
    type: 'escolha',
    id: 'e',
    prompt: 'p',
    options: ['a', 'b'],
    answerIndexes: [0],
    explanation: '',
  };
  const ligar: Exercise = {
    type: 'ligar',
    id: 'l',
    prompt: 'p',
    pairs: [
      { left: 'a', right: '1' },
      { left: 'b', right: '2' },
    ],
  };
  const escrita: Exercise = { type: 'escrita', id: 'w', prompt: 'p', rubric, minChars: 10 };
  const desenho: Exercise = { type: 'desenho', id: 'd', prompt: 'p', rubric };
  const base = { sessionId: 's1', index: 2, conceptId: 'c1', confidence: 0.6 };
  const png = 'data:image/png;base64,iVBORw0KGgo=';

  it('monta o corpo com id determinístico e confiança, sem mode, sessionId de envio nem deferGrading', () => {
    const r = buildAnswerPayload({
      ...base,
      exercise: escolha,
      draft: { type: 'escolha', chosen: [0] },
    });
    expect(r).toEqual({
      body: {
        sessionId: 's1',
        id: 's1:2',
        conceptId: 'c1',
        exerciseId: 'e',
        confidence: 0.6,
        answer: { type: 'escolha', chosen: [0] },
      },
    });
    expect('mode' in (r as any).body).toBe(false);
    expect('deferGrading' in (r as any).body).toBe(false);
  });
  it('recusa confiança ausente, escolha sem seleção, ligar incompleto e escrita curta', () => {
    const err = (r: unknown) => expect((r as { error?: string }).error).toBeTruthy();
    err(
      buildAnswerPayload({
        ...base,
        confidence: undefined,
        exercise: escolha,
        draft: { type: 'escolha', chosen: [0] },
      }),
    );
    err(buildAnswerPayload({ ...base, exercise: escolha, draft: { type: 'escolha', chosen: [] } }));
    err(
      buildAnswerPayload({
        ...base,
        exercise: ligar,
        draft: { type: 'ligar', matches: { a: '1' }, total: 2 },
      }),
    );
    err(
      buildAnswerPayload({ ...base, exercise: escrita, draft: { type: 'escrita', text: 'curto' } }),
    );
    err(
      buildAnswerPayload({
        ...base,
        exercise: escrita,
        draft: { type: 'escrita', text: '          ' },
      }),
    );
    expect(
      'body' in
        buildAnswerPayload({
          ...base,
          exercise: escrita,
          draft: { type: 'escrita', text: 'texto bem longo agora' },
        }),
    ).toBe(true);
    expect(
      'body' in
        buildAnswerPayload({
          ...base,
          exercise: ligar,
          draft: { type: 'ligar', matches: { a: '1', b: '2' }, total: 2 },
        }),
    ).toBe(true);
  });
  it('desenho recusa imagem ausente ou de outro formato e aceita png, jpeg e webp', () => {
    const body = (image?: string) =>
      buildAnswerPayload({ ...base, exercise: desenho, draft: { type: 'desenho', image } });
    expect('error' in body(undefined)).toBe(true);
    expect('error' in body('https://x/a.png')).toBe(true);
    expect('error' in body('data:image/svg+xml;base64,AAAA')).toBe(true);
    for (const url of [png, 'data:image/jpeg;base64,AAAA', 'data:image/webp;base64,AAAA'])
      expect((body(url) as any).body.answer).toEqual({ type: 'desenho', image: url });
  });
  it('requiresCostConfirmation só para desenho fora da Prova', () => {
    expect(requiresCostConfirmation('aprofundar', 'desenho')).toBe(true);
    expect(requiresCostConfirmation('rapido', 'desenho')).toBe(true);
    expect(requiresCostConfirmation('prova', 'desenho')).toBe(false);
    expect(requiresCostConfirmation('aprofundar', 'escrita')).toBe(false);
  });
  it('nextPendingIndex acha o primeiro item sem resposta e -1 quando todos foram respondidos', () => {
    const items = (answered: (number | undefined)[]) => ({
      ...prova(1),
      items: answered.map((answeredAt, i) => ({ conceptId: 'c', exerciseId: 'e' + i, answeredAt })),
    });
    expect(nextPendingIndex(items([1, undefined, 3]))).toBe(1);
    expect(nextPendingIndex(items([1, 2]))).toBe(-1);
    expect(nextPendingIndex(items([undefined]))).toBe(0);
  });
  it('sessionSummaryView oculta correct na Prova enquanto não encerrada', () => {
    const summary = { total: 3, answered: 3, correct: 2, pending: 0, failed: 0 };
    expect(sessionSummaryView(summary, 'prova', false).correct).toBeUndefined();
    expect(sessionSummaryView(summary, 'prova', true).correct).toBe(2);
    expect(sessionSummaryView(summary, 'rapido', false).correct).toBe(2);
  });
});

describe('pendências e prova ativa', () => {
  const base = { id: 's', conceptId: 'c', exerciseId: 'e', tries: 0, createdAt: 1 };
  it('pendingActions: reenviar e descartar fora de prova ativa, nada dentro dela', () => {
    expect(pendingActions({ ...base, state: 'pendente' })).toEqual(['regrade', 'discard']);
    expect(pendingActions({ ...base, state: 'falhou' })).toEqual(['regrade', 'discard']);
    expect(pendingActions({ ...base, state: 'pendente', waitingProva: true })).toEqual([]);
    expect(pendingActions({ ...base, state: 'corrigida' })).toEqual([]);
  });
  it('describePending mostra "Aguardando o fim da prova" para envios de prova ativa', () => {
    const view = describePending([{ ...base, state: 'pendente', waitingProva: true }], {
      writings: 0,
      drawings: 0,
      total: 0,
      overLimit: false,
    });
    expect(view.rows[0].detail).toBe('Aguardando o fim da prova');
  });
});

describe('achados da revisão final da 2D', () => {
  const items = (answered: boolean[]) =>
    answered.map((a, i) => ({
      conceptId: 'c',
      exerciseId: 'e' + i,
      answeredAt: a ? 1 : undefined,
    }));
  it('nextUnansweredIndex vai adiante, volta aos pulados e devolve -1 quando não há mais', () => {
    expect(nextUnansweredIndex(items([true, false, true, false]), 1)).toBe(3);
    expect(nextUnansweredIndex(items([true, false, true, false]), 3)).toBe(1);
    expect(nextUnansweredIndex(items([false, false]), 0)).toBe(1);
    expect(nextUnansweredIndex(items([true, true]), 0)).toBe(-1);
    expect(nextUnansweredIndex(items([false]), 0)).toBe(-1); // só ele mesmo: encerra
  });
  it('shouldAutoFinish só dispara no zero, sem envio em andamento e uma única vez', () => {
    expect(shouldAutoFinish({ remaining: 0, busy: false, fired: false })).toBe(true);
    expect(shouldAutoFinish({ remaining: 0, busy: true, fired: false })).toBe(false);
    expect(shouldAutoFinish({ remaining: 0, busy: false, fired: true })).toBe(false);
    expect(shouldAutoFinish({ remaining: 1000, busy: false, fired: false })).toBe(false);
    expect(shouldAutoFinish({ remaining: null, busy: false, fired: false })).toBe(false);
  });
});
