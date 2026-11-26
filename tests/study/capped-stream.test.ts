import { expect, it } from 'vitest';
import { capBodyStream } from '@/lib/study/capped-stream';

const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      controller.close();
    },
  });

it('deixa passar um corpo dentro do limite', async () => {
  const capped = capBodyStream(streamOf('{"a":', '1}'), 64);
  expect(await new Response(capped.stream).json()).toEqual({ a: 1 });
  expect(capped.exceeded()).toBe(false);
});

it('corta o corpo que passa do limite e marca exceeded', async () => {
  const capped = capBodyStream(streamOf('12345', '67890'), 6);
  await expect(new Response(capped.stream).text()).rejects.toThrow();
  expect(capped.exceeded()).toBe(true);
});

it('não lança com corpo vazio', async () => {
  const capped = capBodyStream(streamOf(), 10);
  expect(await new Response(capped.stream).text()).toBe('');
  expect(capped.exceeded()).toBe(false);
});
