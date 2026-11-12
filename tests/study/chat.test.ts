import { expect, it } from 'vitest';
import { chatInputSchema, chatReplySchema } from '@/lib/study/chat';

it('accepts a bounded conversation ending in a user message', () => {
  expect(chatInputSchema.safeParse({ harness: 'codex', messages: [{ role: 'user', text: 'O que é lógica?' }] }).success).toBe(true);
  expect(chatInputSchema.safeParse({ harness: 'codex', messages: [{ role: 'assistant', text: 'Oi' }] }).success).toBe(false);
  expect(chatInputSchema.safeParse({ harness: 'other', messages: [{ role: 'user', text: 'Oi' }] }).success).toBe(false);
  expect(chatInputSchema.safeParse({ harness: 'codex', messages: Array.from({ length: 7 }, () => ({ role: 'user', text: 'a'.repeat(4000) })) }).success).toBe(false);
  expect(chatReplySchema.safeParse({ reply: 'Uma resposta', topic: 'Lógica' }).success).toBe(true);
  expect(chatReplySchema.safeParse({ reply: '', topic: 'Lógica' }).success).toBe(false);
});
