import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { conceptSchema, emptyWorkspace } from '@/lib/study/domain';

const doubles = vi.hoisted(() => ({
  generate: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: doubles.read,
  saveWorkspace: vi.fn(),
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
import { POST } from '@/app/api/study/[...path]/route';

const node = conceptSchema.parse({
  id: 'private-concept',
  label: 'Conceito salvo',
  summary: 'Referência do servidor.',
  note: 'Nota canônica.',
  courseIds: [],
  origin: 'manual',
  evidence: [],
  attempts: [],
});
function request(route: string, body: unknown, owner = 'owner-a') {
  return POST(
    new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-owner': owner },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: [route] }) },
  );
}
beforeEach(() => {
  doubles.generate.mockReset();
  doubles.read.mockReset().mockImplementation(async (owner: string) => ({
    revision: 7,
    data: { ...emptyWorkspace(), concepts: owner === 'owner-a' ? [node] : [] },
  }));
});

it('uses the canonical owner-scoped concept instead of client-supplied content in grading', async () => {
  doubles.generate.mockResolvedValue(
    JSON.stringify({ score: 1, feedback: 'Avaliado.', missing: [] }),
  );
  const response = await request('grade', {
    conceptId: node.id,
    label: 'Título adulterado',
    note: 'Conteúdo adulterado',
    answer: 'Minha resposta.',
    task: 'Explique a aplicação.',
    harness: 'codex',
  });
  expect(response.status).toBe(200);
  const prompt = doubles.generate.mock.calls[0][0];
  expect(prompt).toContain('Referência do servidor.');
  expect(prompt).toContain('Nota canônica.');
  expect(prompt).not.toMatch(/Título adulterado|Conteúdo adulterado/);
  expect(doubles.read).toHaveBeenCalledWith('owner-a');
  expect(doubles.generate.mock.calls[0].slice(3)).toEqual(['gpt-6-luna', 'codex']);
});

it('denies a foreign concept before calling the model and preserves unauthenticated denial', async () => {
  const body = { conceptId: node.id, label: 'Tema', note: '', harness: 'codex' };
  expect((await request('deepen', body, 'owner-b')).status).toBe(404);
  expect((await request('deepen', body, '')).status).toBe(401);
  expect(doubles.generate).not.toHaveBeenCalled();
});

it('keeps existing callers without a concept ID working', async () => {
  doubles.generate.mockResolvedValue(
    JSON.stringify({
      explanation: 'Explicação.',
      branches: [],
      application: 'Prática.',
    }),
  );
  expect((await request('deepen', { label: 'Tema legado', note: 'Nota legada' })).status).toBe(200);
  expect(doubles.read).not.toHaveBeenCalled();
  expect(doubles.generate.mock.calls[0][0]).toContain('Nota legada');
});
