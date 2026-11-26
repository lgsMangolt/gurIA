import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

afterEach(() => vi.unstubAllEnvs());

const request = (url: string, method = 'GET', origin?: string) => {
  const host = new URL(url).host;
  return proxy(
    new NextRequest(url, { method, headers: { host, ...(origin ? { origin } : {}) } }),
  );
};
const passes = (res: Response) => res.headers.get('x-middleware-next') === '1';

it('só atende localhost, 127.0.0.1 e [::1]', async () => {
  expect((await request('http://example.com/study')).status).toBe(403);
  expect((await request('http://example.com/api/study/workspace')).status).toBe(403);
  expect(passes(await request('http://localhost/study'))).toBe(true);
  expect(passes(await request('http://127.0.0.1:3033/api/study/workspace'))).toBe(true);
  expect(passes(await request('http://[::1]:3033/study'))).toBe(true);
});

it('recusa uma Origin diferente do Host', async () => {
  expect((await request('http://localhost/api/study/workspace', 'GET', 'http://evil.example')).status).toBe(403);
  expect(
    passes(await request('http://localhost:3033/api/study/workspace', 'GET', 'http://localhost:3033')),
  ).toBe(true);
});

it('escrita em /api/study exige Origin', async () => {
  for (const method of ['POST', 'PUT', 'DELETE']) {
    expect((await request('http://localhost/api/study/workspace', method)).status).toBe(403);
    expect(passes(await request('http://localhost/api/study/workspace', method, 'http://localhost'))).toBe(true);
  }
});

it('rotas de API fora de /api/study ficam fechadas', async () => {
  expect((await request('http://localhost/api/generate-classroom', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('http://localhost/api/access-code/verify', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('http://localhost/api/stage-meta/s1', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('http://localhost/api/agent/skills', 'POST', 'http://localhost')).status).toBe(403);
});

it('a raiz leva para /study', async () => {
  const res = await request('http://localhost/');
  expect(res.status).toBe(307);
  expect(new URL(res.headers.get('location')!).pathname).toBe('/study');
});

it('não cria cookie anônimo nem pede código de acesso', async () => {
  vi.stubEnv('ACCESS_CODE', 'um-codigo-qualquer-bem-longo');
  const page = await request('http://localhost/study');
  expect(passes(page)).toBe(true);
  expect(page.headers.get('set-cookie')).toBeNull();
  expect(passes(await request('http://localhost/api/study/workspace'))).toBe(true);
});

it('as APIs e páginas do player antigo estão fechadas', async () => {
  expect((await request('http://localhost/api/stage-meta/stage-test')).status).toBe(403);
  expect((await request('http://localhost/api/stages')).status).toBe(403);
  expect((await request('http://localhost/api/persistence/runtime/x')).status).toBe(403);
  expect((await request('http://localhost/classroom/stage-1')).status).toBe(404);
});

it('a Área Pro não existe mais, nem com a variável antiga', async () => {
  vi.stubEnv('OPENMAIC_STUDY_PRO_CODEX', 'true');
  vi.stubEnv('NEXT_PUBLIC_PRO_WORKBENCH_ENABLED', 'true');
  expect((await request('http://localhost/api/agent/runtime')).status).toBe(403);
  expect((await request('http://localhost/api/agent/sessions')).status).toBe(403);
  expect((await request('http://localhost/api/agent/sessions', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('http://localhost/workbench')).status).toBe(404);
  expect((await request('http://localhost/workspace')).status).toBe(404);
});

it('o proxy não importa nada do projeto', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../proxy.ts', import.meta.url), 'utf8');
  expect(src).not.toMatch(/from '@\//);
});
