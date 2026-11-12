import { z } from 'zod';

export const chatInputSchema = z.object({
  harness: z.enum(['codex', 'claude']),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(4000) }).strict()).min(1).max(20),
}).strict().refine(value => value.messages.at(-1)?.role === 'user' && value.messages.reduce((n, m) => n + m.text.length, 0) <= 24000, 'Conversa inválida ou longa demais.');

export const chatReplySchema = z.object({ reply: z.string().min(1).max(8000), topic: z.string().max(200) }).strict();
