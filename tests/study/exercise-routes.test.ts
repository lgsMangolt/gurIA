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
import { GET, POST } from '@/app/api/study/[...path]/route';

const rubric = [
  { criterion: 'Define', weight: 1 },
  { criterion: 'Exemplo', weight: 1 },
];
const png = 'data:image/png;base64,iVBORw0KGgo=';
const good = JSON.stringify({
  criteria: [
    { index: 0, score: 1, comment: 'a' },
    { index: 1, score: 1, comment: 'b' },
  ],
  feedback: 'bom',
  missing: [],
});
const fresh = (): Workspace =>
  workspaceSchema.parse({
    ...emptyWorkspace(),
    concepts: [
      {
        id: 'c1',
        label: 'Conceito',
        summary: 'Resumo canônico.',
        note: 'Nota canônica.',
        courseIds: [],
        origin: 'manual',
        evidence: [],
        attempts: [],
        exercises: [
          { type: 'escrita', id: 'w1', prompt: 'Explique', rubric },
          { type: 'desenho', id: 'd1', prompt: 'Desenhe', rubric },
        ],
      },
    ],
  });
function call(route: string, body?: unknown, owner = 'owner-a', method: 'POST' | 'GET' = 'POST') {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-owner': owner },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const ctx = { params: Promise.resolve({ path: [route] }) };
  return method === 'POST' ? POST(req, ctx) : GET(req, ctx);
}
const submit = (over: Record<string, unknown> = {}, owner = 'owner-a') =>
  call(
    'exercise-submit',
    {
      id: 's1',
      conceptId: 'c1',
      exerciseId: 'w1',
      harness: 'codex',
      answer: { type: 'escrita', text: 'Minha resposta.' },
      ...over,
    },
    owner,
  );

beforeEach(() => {
  doubles.generate.mockReset();
  doubles.state.revision = 1;
  doubles.state.data = fresh();
});

it('exercise-submit sem dono recebe 401', async () => {
  expect((await submit({}, '')).status).toBe(401);
  expect(doubles.generate).not.toHaveBeenCalled();
});
it('exercise-submit de escrita com IA falsa devolve corrigida e grava a tentativa', async () => {
  doubles.generate.mockResolvedValue(good);
  const res = await submit();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ state: 'corrigida', result: { score: 1 } });
  expect(doubles.state.data.concepts[0].attempts).toHaveLength(1);
  expect(doubles.state.data.concepts[0].attempts[0]).toMatchObject({
    kind: 'write',
  });
  expect(doubles.state.data.concepts[0].attempts[0].mode).toBeUndefined();
  const prompt = doubles.generate.mock.calls[0][0] as string;
  expect(prompt).toContain('Resumo canônico.');
  expect(doubles.generate.mock.calls[0].slice(3)).toEqual(['gpt-6-luna', 'codex']);
});
it('exercise-submit com cota esgotada devolve pendente e a resposta fica guardada', async () => {
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  const body = await (await submit()).json();
  expect(body).toMatchObject({ state: 'pendente', error: { code: 'QUOTA_EXCEEDED' } });
  expect(doubles.state.data.submissions[0]).toMatchObject({ state: 'pendente' });
  expect(doubles.state.data.concepts[0].attempts).toHaveLength(0);
});
it('exercise-submit com corpo inválido devolve 400 e nada é gravado', async () => {
  const before = JSON.stringify(doubles.state.data);
  const wrongType = await submit({ answer: { type: 'ligar', matches: {} } });
  expect(wrongType.status).toBe(400);
  const svg = await submit({
    exerciseId: 'd1',
    answer: { type: 'desenho', image: 'data:image/svg+xml;base64,AAAA' },
  });
  expect(svg.status).toBe(400);
  const empty = await submit({ answer: { type: 'escrita', text: '   ' } });
  expect(empty.status).toBe(400);
  expect(JSON.stringify(doubles.state.data)).toBe(before);
  expect(doubles.generate).not.toHaveBeenCalled();
});
it('exercise-regrade e exercise-grade-batch usam o harness pedido e nunca o outro', async () => {
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  await submit();
  doubles.generate.mockReset().mockResolvedValue(good);
  const other = await call('exercise-regrade', { id: 's1', harness: 'claude' });
  expect(other.status).toBe(409);
  expect((await other.json()).code).toBe('HARNESS_CHANGED');
  const batchOther = await call('exercise-grade-batch', { harness: 'claude' });
  expect(batchOther.status).toBe(409);
  expect(doubles.generate).not.toHaveBeenCalled();
  const batch = await call('exercise-grade-batch', { harness: 'codex' });
  expect(await batch.json()).toMatchObject({ graded: 1, pending: 0 });
  expect(doubles.generate.mock.calls[0][4]).toBe('codex');
  const again = await call('exercise-regrade', { id: 's1' });
  expect(again.status).toBe(409);
  expect((await again.json()).code).toBe('JA_CORRIGIDA');
});
it('exercise-pending não devolve texto nem imagem das respostas e estima o lote', async () => {
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  await submit();
  await submit({
    id: 's2',
    exerciseId: 'd1',
    answer: { type: 'desenho', image: png },
  });
  const res = await call('exercise-pending', undefined, 'owner-a', 'GET');
  expect(res.status).toBe(200);
  const raw = await res.text();
  expect(raw).not.toContain('Minha resposta.');
  expect(raw).not.toContain('iVBORw0KGgo');
  const body = JSON.parse(raw);
  expect(body.items).toHaveLength(2);
  expect(body.estimate).toEqual({ writings: 1, drawings: 1, total: 2, overLimit: false });
});
it('exercise-discard remove um pendente e recusa um corrigido', async () => {
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  await submit();
  const res = await call('exercise-discard', { id: 's1' });
  expect(res.status).toBe(200);
  expect(doubles.state.data.submissions).toEqual([]);
  doubles.generate.mockResolvedValue(good);
  await submit({ id: 's2' });
  const again = await call('exercise-discard', { id: 's2' });
  expect(again.status).toBe(409);
  expect((await again.json()).code).toBe('JA_CORRIGIDA');
});
it('exercise-submit não aceita mode, sessionId nem deferGrading do corpo', async () => {
  for (const extra of [{ mode: 'aprofundar' }, { sessionId: 'x' }, { deferGrading: true }]) {
    const res = await submit(extra);
    expect(res.status).toBe(400);
  }
  expect(doubles.generate).not.toHaveBeenCalled();
  expect(doubles.state.data.submissions).toEqual([]);
});
it('exercise-pending marca como waitingProva os envios de uma prova ativa', async () => {
  doubles.generate.mockRejectedValue({ status: 429, message: 'quota' });
  await submit();
  doubles.state.data.studySessions = [
    {
      id: 'prova-1',
      mode: 'prova',
      state: 'ativa',
      startedAt: Date.now(),
      deadlineAt: Date.now() + 600000,
      limitMinutes: 10,
      items: [{ conceptId: 'c1', exerciseId: 'w1' }],
    },
  ];
  doubles.state.data.submissions[0].sessionId = 'prova-1';
  const body = await (await call('exercise-pending', undefined, 'owner-a', 'GET')).json();
  expect(body.items[0].waitingProva).toBe(true);
  expect(body.estimate.total).toBe(0); // o lote não corrige envio de prova ativa
  doubles.state.data.studySessions[0].state = 'encerrada';
  const after = await (await call('exercise-pending', undefined, 'owner-a', 'GET')).json();
  expect(after.items[0].waitingProva).toBe(false);
});
