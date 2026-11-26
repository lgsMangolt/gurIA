import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const pg = vi.hoisted(() => ({
  created: 0,
  queries: [] as string[],
  options: [] as unknown[],
  listeners: {} as Record<string, (e: Error) => void>,
}));
vi.mock('pg', () => ({
  Pool: class {
    constructor(options: unknown) {
      pg.created += 1;
      pg.options.push(options);
    }
    on(event: string, fn: (e: Error) => void) {
      pg.listeners[event] = fn;
      return this;
    }
    async query(text: string) {
      pg.queries.push(text);
      return { rows: [] };
    }
  },
}));

import { resetStudyPoolForTests, studyPool } from '@/lib/study/db';

beforeEach(() => {
  pg.created = 0;
  pg.queries = [];
  pg.options = [];
  resetStudyPoolForTests();
});
afterEach(() => vi.unstubAllEnvs());

it('sem DATABASE_URL, studyPool falha com uma mensagem em português', async () => {
  vi.stubEnv('DATABASE_URL', '');
  await expect(studyPool()).rejects.toThrow(/DATABASE_URL não está definida/);
  expect(pg.created).toBe(0);
});

it('reaproveita o mesmo pool e cria study_workspace uma única vez', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5441/teste');
  const [a, b] = await Promise.all([studyPool(), studyPool()]);
  const c = await studyPool();
  expect(a).toBe(b);
  expect(a).toBe(c);
  expect(pg.created).toBe(1);
  expect(pg.options[0]).toMatchObject({ connectionString: 'postgres://u:p@localhost:5441/teste' });
  expect(pg.queries.filter((q) => q.includes('CREATE TABLE IF NOT EXISTS study_workspace'))).toHaveLength(1);
});

it('um DATABASE_URL diferente abre um pool novo', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5441/um');
  const a = await studyPool();
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5441/dois');
  const b = await studyPool();
  expect(a).not.toBe(b);
  expect(pg.created).toBe(2);
});

it('um erro numa conexão ociosa é registrado e não derruba o processo', async () => {
  vi.stubEnv('DATABASE_URL', 'postgres://u:p@localhost:5441/teste');
  await studyPool();
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(pg.listeners.error).toBeTypeOf('function');
  expect(() => pg.listeners.error(new Error('terminating connection due to administrator command'))).not.toThrow();
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
