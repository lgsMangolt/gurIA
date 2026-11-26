import { z } from 'zod';
import type { AttemptKind } from '../domain';

export const rubricItemSchema = z.object({
  criterion: z.string().min(1).max(300),
  weight: z.number().min(0.1).max(5).default(1),
});
const base = { id: z.string().min(1).max(120), prompt: z.string().min(1).max(4000) };
const unique = (values: string[]) => new Set(values).size === values.length;

export const escolhaSchema = z
  .object({
    type: z.literal('escolha'),
    ...base,
    options: z.array(z.string().min(1).max(1000)).min(2).max(6),
    answerIndexes: z.array(z.number().int().min(0)).min(1),
    explanation: z.string().max(4000).default(''),
  })
  .superRefine((ex, ctx) => {
    if (ex.answerIndexes.some((i) => i >= ex.options.length))
      ctx.addIssue({ code: 'custom', message: 'Resposta fora das opções.' });
    if (new Set(ex.answerIndexes).size !== ex.answerIndexes.length)
      ctx.addIssue({ code: 'custom', message: 'Respostas repetidas.' });
  });

export const ligarSchema = z
  .object({
    type: z.literal('ligar'),
    ...base,
    pairs: z
      .array(z.object({ left: z.string().min(1).max(500), right: z.string().min(1).max(500) }))
      .min(2)
      .max(8),
  })
  .superRefine((ex, ctx) => {
    if (!unique(ex.pairs.map((p) => p.left)))
      ctx.addIssue({ code: 'custom', message: 'Lado esquerdo repetido.' });
    if (!unique(ex.pairs.map((p) => p.right)))
      ctx.addIssue({ code: 'custom', message: 'Lado direito repetido.' });
  });

export const desenhoSchema = z.object({
  type: z.literal('desenho'),
  ...base,
  rubric: z.array(rubricItemSchema).min(2).max(6),
});
export const escritaSchema = z.object({
  type: z.literal('escrita'),
  ...base,
  rubric: z.array(rubricItemSchema).min(2).max(6),
  minChars: z.number().int().min(0).max(5000).default(0),
});

export const exerciseSchema = z.discriminatedUnion('type', [
  escolhaSchema,
  ligarSchema,
  desenhoSchema,
  escritaSchema,
]);
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseType = Exercise['type'];

const kinds: Record<ExerciseType, AttemptKind> = {
  escolha: 'choice',
  ligar: 'connect',
  desenho: 'draw',
  escrita: 'write',
};
export const attemptKindOf = (type: ExerciseType): AttemptKind => kinds[type];
