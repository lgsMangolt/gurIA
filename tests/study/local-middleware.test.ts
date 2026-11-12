import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

afterEach(() => vi.unstubAllEnvs());

it('permits only the read-only stage metadata lookup in local study mode', async () => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  vi.stubEnv('ACCESS_CODE', '');
  const get = await middleware(new NextRequest('http://localhost/api/stage-meta/stage-test'));
  expect(get.headers.get('x-middleware-next')).toBe('1');
  const post = await middleware(new NextRequest('http://localhost/api/stage-meta/stage-test', { method: 'POST' }));
  expect(post.status).toBe(403);
  const generation = await middleware(new NextRequest('http://localhost/api/generate-classroom', { method: 'POST' }));
  expect(generation.status).toBe(403);
  const remote = await middleware(new NextRequest('http://example.com/api/stage-meta/stage-test'));
  expect(remote.status).toBe(403);
});

it('exposes only local Pro session endpoints with same-origin writes when enabled', async () => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  vi.stubEnv('OPENMAIC_STUDY_PRO_CODEX', 'true');
  vi.stubEnv('ACCESS_CODE', '');
  const request = (path: string, method = 'GET', origin?: string) => middleware(new NextRequest(`http://localhost${path}`, { method, headers: { host: 'localhost', ...(origin ? { origin } : {}) } }));
  expect((await request('/api/agent/sessions')).headers.get('x-middleware-next')).toBe('1');
  expect((await request('/api/agent/sessions/s1/events')).headers.get('x-middleware-next')).toBe('1');
  expect((await request('/api/agent/sessions', 'POST')).status).toBe(403);
  expect((await request('/api/agent/sessions', 'POST', 'http://localhost')).headers.get('x-middleware-next')).toBe('1');
  expect((await request('/api/agent/sessions/s1/messages', 'POST', 'http://evil.example')).status).toBe(403);
  expect((await request('/api/agent/skills', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('/api/agent/sessions/s1/materials', 'POST', 'http://localhost')).status).toBe(403);
  expect((await request('/api/generate-classroom', 'POST', 'http://localhost')).status).toBe(403);
});
