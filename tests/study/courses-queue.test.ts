import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/study/runtime/analysis';
import { processQueue, type QueueState } from '@/lib/study/courses/queue';

describe('processQueue', () => {
  it('processa em ordem e marca done', async () => {
    const order: string[] = [];
    const saves: QueueState[] = [];
    const final = await processQueue(
      'c1',
      ['a', 'b', 'c'],
      async (id) => {
        order.push(id);
      },
      (q) => saves.push(structuredClone(q)),
    );
    expect(order).toEqual(['a', 'b', 'c']);
    expect(final).toMatchObject({ done: ['a', 'b', 'c'], running: false });
    expect(final.failed).toBeUndefined();
    expect(saves[0]).toMatchObject({ running: true, done: [] });
  });

  it('para na falha de cota e mantém o resto pendente', async () => {
    const processOne = vi.fn(async (id: string) => {
      if (id === 'b') throw new AppError(429, 'QUOTA_EXCEEDED', 'A cota acabou.');
    });
    const final = await processQueue('c1', ['a', 'b', 'c'], processOne, () => {});
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(final).toMatchObject({
      done: ['a'],
      failed: { lessonId: 'b', message: 'A cota acabou.' },
      running: false,
    });
  });

  it('erro de uma aula só (sem texto) não para a fila', async () => {
    const final = await processQueue(
      'c1',
      ['a', 'b'],
      async (id) => {
        if (id === 'a') throw new AppError(422, 'SEM_TEXTO', 'Sem texto.');
      },
      () => {},
    );
    expect(final.done).toEqual(['b']);
    expect(final.errors).toEqual([{ lessonId: 'a', message: 'Sem texto.' }]);
    expect(final.failed).toBeUndefined();
  });
});

describe('queueAdvanced (revisão final I5)', () => {
  it('avisa quando uma aula termina ou falha, para recarregar os estudos', async () => {
    const { queueAdvanced } = await import('@/lib/study/courses/queue-progress');
    const q = (done: string[], errors: string[] = []) => ({
      done,
      errors: errors.map((lessonId) => ({ lessonId, message: 'x' })),
    });
    expect(queueAdvanced(null, q([]))).toBe(false);
    expect(queueAdvanced(q([]), q(['a']))).toBe(true);
    expect(queueAdvanced(q(['a']), q(['a']))).toBe(false);
    expect(queueAdvanced(q(['a']), q(['a'], ['b']))).toBe(true);
  });
});
