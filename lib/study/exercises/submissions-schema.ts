import { z } from 'zod';

// Espelha `studyModes` de domain.ts (um teste confere); duplicado para não criar ciclo de importação.
export const submissionModes = ['rapido', 'aprofundar', 'prova', 'revisao'] as const;
export const MAX_IMAGE_CHARS = 1_500_000;

export const submissionAnswerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('escrita'), text: z.string().min(1).max(10000) }),
  z.object({ type: z.literal('desenho'), image: z.string().max(MAX_IMAGE_CHARS).optional() }),
]);
export type SubmissionAnswer = z.infer<typeof submissionAnswerSchema>;

export const gradeResultSchema = z.object({
  score: z.number().min(0).max(1),
  correct: z.boolean(),
  feedback: z.string().max(4000),
  missing: z.array(z.string().max(500)).max(8),
  criteria: z
    .array(
      z.object({
        criterion: z.string().max(300),
        score: z.number().min(0).max(1),
        comment: z.string().max(1000),
      }),
    )
    .max(6),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;

export const submissionStates = ['pendente', 'corrigida', 'falhou'] as const;
export const submissionSchema = z.object({
  id: z.string().min(1).max(200),
  conceptId: z.string().min(1).max(200),
  exerciseId: z.string().min(1).max(200),
  sessionId: z.string().max(200).optional(),
  mode: z.enum(submissionModes).optional(),
  helped: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: z.number(),
  answer: submissionAnswerSchema,
  state: z.enum(submissionStates),
  tries: z.number().int().nonnegative().default(0),
  lastError: z.object({ code: z.string().max(100), message: z.string().max(1000) }).optional(),
  result: gradeResultSchema.optional(),
  gradedAt: z.number().optional(),
});
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionState = Submission['state'];
