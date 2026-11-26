import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const doubles = vi.hoisted(() => ({ prompts: [] as string[], reply: '' }));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: vi.fn(),
  saveWorkspace: vi.fn(),
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({
    root: os.tmpdir(),
    harness: 'claude',
    model: 'sonnet',
    generate: async (prompt: string) => {
      doubles.prompts.push(prompt);
      return doubles.reply;
    },
  }),
}));
vi.mock('@/lib/study/runtime/media', () => ({ localReady: () => true }));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    _req: NextRequest,
    handler: (owner: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => handler({ ownerId: 'owner-a' }, new Headers()),
}));
import { GET, POST } from '@/app/api/study/[...path]/route';

const env = { local: process.env.OPENMAIC_STUDY_LOCAL, dir: process.env.GURIA_SKILLS_DIR };
let dir = '';
const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), text);
};
function call(route: string, body?: unknown) {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (body === undefined ? GET : POST)(req, { params: Promise.resolve({ path: [route] }) });
}
const input = {
  harness: 'claude',
  setup: { cargo: 'Analista de dados', tipo: 'comportamental', nivel: 'pleno' },
  messages: [{ role: 'user', text: 'Pode começar.' }],
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-skills-rota-'));
  process.env.GURIA_SKILLS_DIR = dir;
  process.env.OPENMAIC_STUDY_LOCAL = 'true';
  doubles.prompts = [];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
afterAll(() => {
  process.env.OPENMAIC_STUDY_LOCAL = env.local;
  if (env.dir === undefined) delete process.env.GURIA_SKILLS_DIR;
  else process.env.GURIA_SKILLS_DIR = env.dir;
});

describe('rotas da Entrevista', () => {
  it('sem as skills: status diz o que falta e o turno é recusado sem chamar a IA', async () => {
    expect(await (await call('interview-status')).json()).toMatchObject({
      mockInterview: false,
      coach: false,
    });
    const res = await call('interview-turn', input);
    expect(res.status).toBe(409);
    expect(doubles.prompts).toEqual([]);
  });

  it('com as skills: o turno manda a persona e devolve a fala do entrevistador', async () => {
    write('mock-interview/references/interviewer-persona.md', '# P\nPERSONA-DA-SKILL');
    write('job-search-os/references/commands/mock.md', '# mock\nRUBRICA-DA-SKILL');
    doubles.reply = JSON.stringify({ reply: 'Fale de um projeto seu.', finished: false });
    const res = await call('interview-turn', input);
    expect(await res.json()).toEqual({ reply: 'Fale de um projeto seu.', finished: false });
    expect(doubles.prompts[0]).toContain('PERSONA-DA-SKILL');
    doubles.reply = JSON.stringify({ feedback: '## Plus\n...' });
    expect(await (await call('interview-feedback', input)).json()).toEqual({
      feedback: '## Plus\n...',
    });
    expect(doubles.prompts[1]).toContain('RUBRICA-DA-SKILL');
  });

  it('fora do modo local recusa com 403', async () => {
    process.env.OPENMAIC_STUDY_LOCAL = 'false';
    expect((await call('interview-status')).status).toBe(403);
  });
});
