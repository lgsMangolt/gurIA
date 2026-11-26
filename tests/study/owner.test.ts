import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveOwnerId, withRequestOwner } from '@/lib/study/owner';

it('sem OWNER_SINGLE_USER não há dono', () => {
  expect(resolveOwnerId({})).toBeNull();
  expect(resolveOwnerId({ OWNER_SINGLE_USER: 'false' })).toBeNull();
});

it('com OWNER_SINGLE_USER o dono é study-local ou o id configurado', () => {
  expect(resolveOwnerId({ OWNER_SINGLE_USER: 'true' })).toBe('study-local');
  expect(resolveOwnerId({ OWNER_SINGLE_USER: '1', OWNER_SINGLE_USER_ID: ' readme-demo ' })).toBe(
    'readme-demo',
  );
});

it('recusa um id de dono malformado ou uma chave escrita errado', () => {
  expect(() => resolveOwnerId({ OWNER_SINGLE_USER: 'true', OWNER_SINGLE_USER_ID: 'anon:x' })).toThrow(
    /OWNER_SINGLE_USER_ID/,
  );
  expect(() => resolveOwnerId({ OWNER_SINGLE_USER: 'sim' })).toThrow(/OWNER_SINGLE_USER/);
});

it('withRequestOwner sem dono devolve 401 sem chamar o handler', async () => {
  vi.stubEnv('OWNER_SINGLE_USER', '');
  vi.stubEnv('OWNER_SINGLE_USER_ID', '');
  const handler = vi.fn();
  const res = await withRequestOwner(new NextRequest('http://localhost/api/study/workspace'), handler);
  expect(res.status).toBe(401);
  expect(handler).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

it('withRequestOwner repassa o dono e um Headers que a rota preenche, sem cookie', async () => {
  vi.stubEnv('OWNER_SINGLE_USER', 'true');
  vi.stubEnv('OWNER_SINGLE_USER_ID', 'readme-demo');
  const res = await withRequestOwner(
    new NextRequest('http://localhost/api/study/workspace'),
    async (owner, headers) => {
      headers.set('Cache-Control', 'no-store');
      return Response.json({ owner: owner.ownerId }, { headers });
    },
  );
  expect(await res.json()).toEqual({ owner: 'readme-demo' });
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('set-cookie')).toBeNull();
  vi.unstubAllEnvs();
});

it('withRequestOwner responde 500 quando o handler lança', async () => {
  vi.stubEnv('OWNER_SINGLE_USER', 'true');
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await withRequestOwner(new NextRequest('http://localhost/api/study/x'), async () => {
    throw new Error('quebrou');
  });
  expect(res.status).toBe(500);
  spy.mockRestore();
  vi.unstubAllEnvs();
});
