import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyWorkspace } from '@/lib/study/domain';

const doubles = vi.hoisted(() => ({ root: '', calls: [] as string[] }));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: async () => ({ revision: 1, data: emptyWorkspace() }),
  saveWorkspace: vi.fn(),
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({ root: doubles.root, harness: 'codex', model: 'm', generate: vi.fn() }),
}));
vi.mock('@/lib/study/runtime/media', () => ({ localReady: () => true }));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    _req: NextRequest,
    handler: (owner: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => handler({ ownerId: 'owner-a' }, new Headers()),
}));
vi.mock('@/lib/study/reminder-task', async (orig) => {
  const real = await orig<typeof import('@/lib/study/reminder-task')>();
  return {
    ...real,
    runPowerShell: async (script: string) => {
      doubles.calls.push(script);
      if (script.includes('Register-ScheduledTask'))
        return '{"ativo":true,"hora":"07:30","proxima":"2026-11-25T07:30:00"}';
      return '{"ativo":false}';
    },
  };
});
import { GET, PUT } from '@/app/api/study/[...path]/route';

const previous = process.env.OPENMAIC_STUDY_LOCAL;
function call(method: 'GET' | 'PUT', body?: unknown) {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/reminder', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (method === 'GET' ? GET : PUT)(req, { params: Promise.resolve({ path: ['reminder'] }) });
}

beforeEach(() => {
  doubles.root = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-lembrete-rota-'));
  doubles.calls = [];
  process.env.OPENMAIC_STUDY_LOCAL = 'true';
});
afterEach(() => fs.rmSync(doubles.root, { recursive: true, force: true }));
afterAll(() => {
  process.env.OPENMAIC_STUDY_LOCAL = previous;
});

describe.runIf(process.platform === 'win32')('rota do lembrete', () => {
  it('hora inválida é recusada com 400 e nada roda no PowerShell', async () => {
    for (const hora of ['25:00', '7:00; rm', "19:00'"]) {
      const res = await call('PUT', { ativo: true, hora });
      expect(res.status).toBe(400);
    }
    expect(doubles.calls).toEqual([]);
  });

  it('ligar grava o resumo e registra a tarefa com a hora pedida', async () => {
    const res = await call('PUT', { ativo: true, hora: '07:30' });
    expect(await res.json()).toMatchObject({ suportado: true, ativo: true, hora: '07:30' });
    expect(doubles.calls[0]).toContain("-At '07:30'");
    expect(fs.existsSync(path.join(doubles.root, 'lembrete-revisoes.json'))).toBe(true);
  });

  it('desligar remove a tarefa', async () => {
    const res = await call('PUT', { ativo: false });
    expect(await res.json()).toEqual({ suportado: true, ativo: false });
    expect(doubles.calls[0]).toContain('Unregister-ScheduledTask');
  });

  it('fora do modo local responde não suportado sem rodar nada', async () => {
    process.env.OPENMAIC_STUDY_LOCAL = 'false';
    expect(await (await call('GET')).json()).toEqual({ suportado: false, ativo: false });
    expect(doubles.calls).toEqual([]);
  });
});
