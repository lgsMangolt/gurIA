import { z } from 'zod';
import { improvementSchema } from './improvement';

export const courseSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  url: z.string().max(2000).default(''),
  minutes: z.number().min(0).max(100000).nullable(),
  practiceMinutes: z.number().min(0).max(100000).default(0),
  reviewMinutes: z.number().min(0).max(100000).default(0),
  completedMinutes: z.number().nonnegative().default(0),
  deadline: z.iso.date().nullable(),
  hoursSource: z.enum(['official', 'measured', 'estimate', 'unknown']),
  stageId: z.string().optional(),
  learningType: z.enum(['course', 'free']).optional(),
  sourceNote: z.string().max(4000).default(''),
  lessons: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
        minutes: z.number().positive().max(100000),
      }),
    )
    .max(1000)
    .optional(),
});
export const questionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string(),
});
export const conceptSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(160),
  summary: z.string().max(20000),
  note: z.string().max(100000),
  courseIds: z.array(z.string()).max(100),
  origin: z.enum(['lesson', 'manual', 'ai']),
  question: questionSchema.optional(),
  evidence: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
        mediaUrl: z.string().optional(),
        courseId: z.string().optional(),
      }),
    )
    .max(100),
  attempts: z
    .array(
      z.object({
        at: z.number(),
        sourceId: z.string().optional(),
        correct: z.boolean(),
        kind: z.enum(['choice', 'explanation', 'application']),
        score: z.number().min(0).max(1),
      }),
    )
    .max(200),
  due: z.number().default(0),
});
export const sessionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  courseId: z.string(),
  kind: z.enum(['lesson', 'practice', 'review']),
  date: z.iso.date(),
  actualMinutes: z.number().positive().max(720),
  completedMinutes: z.number().nonnegative().max(100000),
  title: z.string().max(250),
});
export const workspaceSchema = z.object({
  improvement: improvementSchema,
  courses: z.array(courseSchema).max(500),
  concepts: z.array(conceptSchema).max(5000),
  connections: z
    .array(
      z.object({ id: z.string(), source: z.string(), target: z.string(), relation: z.string() }),
    )
    .max(10000),
  availability: z.array(z.number().min(0).max(720)).length(7),
  energy: z.enum(['tired', 'normal', 'focused', 'hyperfocused']),
  energyDate: z.iso.date().optional(),
  sessions: z.array(sessionSchema).max(20000).default([]),
  dayOverrides: z.record(z.iso.date(), z.number().min(0).max(720)).default({}),
});
export type Course = z.infer<typeof courseSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
export const emptyWorkspace = (): Workspace => ({
  improvement: { events: [] },
  courses: [],
  concepts: [],
  connections: [],
  availability: [0, 60, 60, 60, 60, 60, 0],
  energy: 'normal',
  sessions: [],
  dayOverrides: {},
});
export function validateReferences(state: Workspace) {
  const courses = new Set(state.courses.map((c) => c.id)),
    concepts = new Set(state.concepts.map((n) => n.id));
  if (courses.size !== state.courses.length || concepts.size !== state.concepts.length)
    throw new Error('Identificadores duplicados.');
  if (new Set(state.sessions.map((s) => s.id)).size !== state.sessions.length)
    throw new Error('Sessão registrada mais de uma vez.');
  for (const session of state.sessions)
    if (session.courseId && !courses.has(session.courseId))
      throw new Error('Sessão referencia curso inexistente.');
  for (const course of state.courses)
    if (new Set((course.lessons || []).map((l) => l.id)).size !== (course.lessons || []).length)
      throw new Error('Aula duplicada.');
  for (const n of state.concepts)
    if (n.courseIds.some((id) => !courses.has(id)))
      throw new Error('Conceito referencia curso inexistente.');
  for (const e of state.connections)
    if (!concepts.has(e.source) || !concepts.has(e.target) || e.source === e.target)
      throw new Error('Conexão inválida.');
}
export function mastery(node: Concept) {
  const correct = node.attempts.filter((a) => a.correct);
  const days = new Set(correct.map((a) => new Date(a.at).toLocaleDateString('en-CA'))).size;
  const applied = correct.some((a) => a.kind !== 'choice');
  const accuracy = node.attempts.length ? correct.length / node.attempts.length : 0;
  return {
    fraction: Math.min(0.95, (days / 3) * 0.75 + (applied ? 0.2 : 0)),
    mastered: days >= 3 && applied && accuracy >= 0.8,
    days,
    accuracy,
  };
}
export function recordAnswer(
  node: Concept,
  correct: boolean,
  kind: Concept['attempts'][number]['kind'],
  score = Number(correct),
  now = Date.now(),
  sourceId?: string,
): Concept {
  if (sourceId && node.attempts.some((a) => a.sourceId === sourceId)) return node;
  const attempts = [...node.attempts, { at: now, correct, kind, score, sourceId }].slice(-200);
  const interval = correct
    ? Math.min(
        30,
        [1, 3, 7, 14, 30][
          Math.min(
            4,
            new Set(attempts.filter((a) => a.correct).map((a) => new Date(a.at).toDateString()))
              .size - 1,
          )
        ] || 1,
      )
    : 1;
  return { ...node, attempts, due: now + interval * 86400000 };
}
export { planStudy, recordSession, dateKey, courseProgress } from './planner';
