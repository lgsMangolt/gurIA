import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyWorkspace, workspaceSchema, type Workspace } from '@/lib/study/domain';

const doubles = vi.hoisted(() => ({
  generate: vi.fn(),
  state: { revision: 1, data: null as unknown as Workspace },
}));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: async () => ({ revision: doubles.state.revision, data: doubles.state.data }),
  saveWorkspace: async (_owner: string, revision: number, raw: unknown) => {
    if (revision !== doubles.state.revision) throw new Error('revisão inesperada');
    doubles.state.data = workspaceSchema.parse(raw);
    doubles.state.revision++;
    return { revision: doubles.state.revision, data: doubles.state.data };
  },
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({ harness: 'codex', model: 'gpt-6-luna', generate: doubles.generate }),
}));
vi.mock('@/lib/study/runtime/media', () => ({ localReady: () => true }));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    req: NextRequest,
    handler: (owner: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => {
    const ownerId = req.headers.get('x-test-owner');
    return ownerId ? handler({ ownerId }, new Headers()) : new Response(null, { status: 401 });
  },
}));
import { GET, POST, PUT } from '@/app/api/study/[...path]/route';

const rubric = [
  { criterion: 'a', weight: 1 },
  { criterion: 'b', weight: 1 },
];
const good = JSON.stringify({
  criteria: [
    { index: 0, score: 1, comment: 'a' },
    { index: 1, score: 1, comment: 'b' },
  ],
  feedback: 'bom',
  missing: [],
});
const attempt = {
  at: Date.now() - 5 * 86400000,
  correct: true,
  kind: 'choice',
  score: 1,
  helped: false,
};
const fresh = (): Workspace =>
  workspaceSchema.parse({
    ...emptyWorkspace(),
    concepts: [
      {
        id: 'c1',
        label: 'Conceito',
        summary: 'Resumo.',
        note: 'Nota.',
        courseIds: [],
        origin: 'manual',
        evidence: [],
        attempts: [attempt],
        due: Date.now() - 86400000,
        exercises: [
          {
            type: 'escolha',
            id: 'e1',
            prompt: 'p',
            options: ['a', 'b'],
            answerIndexes: [0],
            explanation: '',
          },
          { type: 'escrita', id: 'w1', prompt: 'Explique', rubric },
        ],
      },
    ],
  });
function call(
  route: string,
  body?: unknown,
  owner = 'owner-a',
  method: 'POST' | 'GET' | 'PUT' = 'POST',
) {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-owner': owner },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const ctx = { params: Promise.resolve({ path: [route] }) };
  return method === 'POST' ? POST(req, ctx) : method === 'PUT' ? PUT(req, ctx) : GET(req, ctx);
}
const start = (over: Record<string, unknown> = {}, owner = 'owner-a') =>
  call('session-start', { id: 's1', mode: 'rapido', ...over }, owner);
const answer = (over: Record<string, unknown> = {}) =>
  call('session-answer', {
    sessionId: 's1',
    id: 'a1',
    conceptId: 'c1',
    exerciseId: 'e1',
    answer: { type: 'escolha', chosen: [0] },
    ...over,
  });

beforeEach(() => {
  doubles.generate.mockReset();
  doubles.state.revision = 1;
  doubles.state.data = fresh();
});

it('session-start sem dono recebe 401', async () => {
  expect((await start({}, '')).status).toBe(401);
});
it('session-start rapido devolve a sessão e grava', async () => {
  const res = await start();
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.session).toMatchObject({ id: 's1', mode: 'rapido', state: 'ativa' });
  expect(doubles.state.data.studySessions).toHaveLength(1);
  expect((await start({ id: 's2' })).status).toBe(409);
});
it('session-answer usa o modo da sessão e rejeita campos extras de modo', async () => {
  await start();
  const spoof = await answer({ mode: 'revisao', sessionId: 's1', deferGrading: true, extra: 1 });
  expect(spoof.status).toBe(400);
  expect(doubles.state.data.concepts[0].attempts).toHaveLength(1);
  const res = await answer();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ state: 'corrigida', result: { correct: true } });
  expect(doubles.state.data.concepts[0].attempts.at(-1)).toMatchObject({
    mode: 'rapido',
    sessionId: 's1',
  });
});
it('session-answer da Prova depois do prazo dá 409 PROVA_ENCERRADA', async () => {
  const res = await start({ mode: 'prova', conceptIds: ['c1'] });
  expect(res.status).toBe(200);
  doubles.state.data.studySessions[0].deadlineAt = Date.now() - 10 * 60000;
  const item = doubles.state.data.studySessions[0].items[0];
  const late = await answer({
    conceptId: item.conceptId,
    exerciseId: item.exerciseId,
    answer: { type: 'escrita', text: 'Resposta tardia.' },
  });
  expect(late.status).toBe(409);
  expect((await late.json()).code).toBe('PROVA_ENCERRADA');
  expect(doubles.state.data.submissions).toHaveLength(0);
});
it('session-finish e session-grade usam o harness pedido e nunca o outro', async () => {
  await start({ mode: 'prova', conceptIds: ['c1'] });
  const item = doubles.state.data.studySessions[0].items[0];
  const sent = await answer({
    conceptId: item.conceptId,
    exerciseId: item.exerciseId,
    answer: { type: 'escrita', text: 'Minha resposta.' },
  });
  expect((await sent.json()).result).toBeUndefined();
  const early = await call('session-grade', { sessionId: 's1' });
  expect(early.status).toBe(409);
  expect((await early.json()).code).toBe('SESSAO_ATIVA_NAO_CORRIGE');
  const fin = await call('session-finish', { sessionId: 's1' });
  expect(fin.status).toBe(200);
  expect((await fin.json()).summary).toMatchObject({ total: 1, answered: 1, pending: 1 });
  doubles.generate.mockResolvedValue(good);
  const other = await call('session-grade', { sessionId: 's1', harness: 'claude' });
  expect(other.status).toBe(409);
  expect((await other.json()).code).toBe('HARNESS_CHANGED');
  expect(doubles.generate).not.toHaveBeenCalled();
  const graded = await call('session-grade', { sessionId: 's1', harness: 'codex' });
  expect(await graded.json()).toMatchObject({ graded: 1, pending: 0 });
  expect(doubles.generate.mock.calls[0][4]).toBe('codex');
});
it('session-active devolve null sem sessão e a sessão ativa depois', async () => {
  const none = await call('session-active', undefined, 'owner-a', 'GET');
  expect(await none.json()).toMatchObject({ session: null });
  await start();
  const active = await call('session-active', undefined, 'owner-a', 'GET');
  const body = await active.json();
  expect(body.session).toMatchObject({ id: 's1', state: 'ativa' });
  expect(JSON.stringify(body)).not.toContain('answerIndexes');
});
it('GET workspace não devolve o texto nem a imagem das respostas', async () => {
  doubles.state.data.submissions = [
    {
      id: 'x1',
      conceptId: 'c1',
      exerciseId: 'w1',
      helped: false,
      createdAt: 1,
      answer: { type: 'escrita', text: 'resposta guardada no servidor' },
      state: 'pendente',
      tries: 0,
    },
  ];
  const res = await call('workspace', undefined, 'owner-a', 'GET');
  const raw = await res.text();
  expect(raw).not.toContain('resposta guardada no servidor');
  expect(JSON.parse(raw).data.submissions[0]).toMatchObject({ id: 'x1', state: 'pendente' });
});
it('PUT workspace do cliente não reescreve studySessions nem submissions', async () => {
  await start();
  const before = JSON.stringify(doubles.state.data.studySessions);
  const got = await (await call('workspace', undefined, 'owner-a', 'GET')).json();
  got.data.studySessions[0].deadlineAt = 9e12;
  got.data.studySessions[0].items.forEach((i: any) => (i.answeredAt = 1));
  got.data.submissions = [];
  const res = await call('workspace', { revision: got.revision, data: got.data }, 'owner-a', 'PUT');
  expect(res.status).toBe(200);
  expect(JSON.stringify(doubles.state.data.studySessions)).toBe(before);
});
it('session-start e session-active devolvem now', async () => {
  const started = await (await start()).json();
  expect(typeof started.now).toBe('number');
  const active = await (await call('session-active', undefined, 'owner-a', 'GET')).json();
  expect(typeof active.now).toBe('number');
});
it('workspace-backup devolve o workspace completo, com as respostas guardadas', async () => {
  doubles.state.data.submissions = [
    {
      id: 'x1',
      conceptId: 'c1',
      exerciseId: 'w1',
      helped: false,
      createdAt: 1,
      answer: { type: 'escrita', text: 'resposta que precisa entrar no backup' },
      state: 'pendente',
      tries: 0,
    },
  ];
  const body = await (await call('workspace-backup', undefined, 'owner-a', 'GET')).json();
  expect(body.data.submissions[0].answer.text).toBe('resposta que precisa entrar no backup');
  expect((await call('workspace-backup', undefined, '', 'GET')).status).toBe(401);
});
