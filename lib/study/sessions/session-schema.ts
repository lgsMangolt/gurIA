import { z } from 'zod';

// Espelha `studyModes` de domain.ts (um teste confere); duplicado para não criar ciclo de importação.
export const sessionModes = ['rapido', 'aprofundar', 'prova', 'revisao'] as const;

export const studySessionSchema = z.object({
  id: z.string().min(1).max(200),
  mode: z.enum(sessionModes),
  state: z.enum(['ativa', 'encerrada', 'expirada']),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  deadlineAt: z.number().optional(),
  limitMinutes: z.number().int().min(1).max(600).optional(),
  items: z
    .array(
      z.object({
        conceptId: z.string().min(1).max(200),
        exerciseId: z.string().min(1).max(200),
        answeredAt: z.number().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type StudySession = z.infer<typeof studySessionSchema>;
