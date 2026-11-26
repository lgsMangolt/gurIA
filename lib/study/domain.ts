import { z } from 'zod';
import { improvementSchema } from './improvement';

// Estados de uma aula importada (etapa 5).
export const lessonStatuses = [
  'importada',
  'precisa-transcrever',
  'sem-texto',
  'escaneado',
  'processando',
  'aguardando-revisao',
  'processada',
  'falhou',
  'fonte-ausente',
  'texto-ausente',
] as const;
export type LessonStatus = (typeof lessonStatuses)[number];
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
  // Curso importado (etapa 5): de onde veio e a licença declarada pela fonte.
  origin: z.enum(['pasta', 'arquivos', 'zip', 'ocw', 'youtube']).optional(),
  license: z.string().max(300).optional(),
  importSource: z.string().max(2000).optional(),
  lessons: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200),
        minutes: z.number().positive().max(100000),
        status: z.enum(lessonStatuses).optional(),
        summary: z.string().max(20000).optional(),
        sourceIds: z.array(z.string().min(1).max(120)).max(50).optional(),
        minutesEstimated: z.boolean().optional(),
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
import { exerciseSchema } from './exercises/schema';
import { submissionSchema } from './exercises/submissions-schema';
import { studySessionSchema } from './sessions/session-schema';
export const attemptKinds = [
  'choice',
  'explanation',
  'application',
  'connect',
  'draw',
  'write',
] as const;
export type AttemptKind = (typeof attemptKinds)[number];
export const studyModes = ['rapido', 'aprofundar', 'prova', 'revisao'] as const;
export type StudyMode = (typeof studyModes)[number];
export type AttemptExtra = {
  mode?: StudyMode;
  helped?: boolean;
  confidence?: number;
  sessionId?: string;
};
export const attemptSchema = z.object({
  at: z.number(),
  sourceId: z.string().optional(),
  correct: z.boolean(),
  kind: z.enum(attemptKinds),
  score: z.number().min(0).max(1),
  mode: z.enum(studyModes).optional(),
  helped: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  sessionId: z.string().optional(),
});
export type Attempt = z.infer<typeof attemptSchema>;
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
  attempts: z.array(attemptSchema).max(200),
  exercises: z.array(exerciseSchema).max(30).default([]),
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
  submissions: z.array(submissionSchema).max(300).default([]),
  studySessions: z.array(studySessionSchema).max(200).default([]),
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
  submissions: [],
  studySessions: [],
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
export const MASTERY_MIN_EVIDENCE = 2;
export const MASTERY_MIN_GAP_DAYS = 3;
export const EVIDENCE_KINDS: AttemptKind[] = [
  'connect',
  'draw',
  'write',
  'application',
  'explanation',
];
export function isEvidence(a: Attempt): boolean {
  // Acertos no modo Rápido têm peso baixo: contam para o progresso, mas não bastam como evidência.
  return a.correct && !a.helped && a.mode !== 'rapido' && EVIDENCE_KINDS.includes(a.kind);
}
const calendarDay = (at: number) => {
  const d = new Date(at);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};
export function mastery(node: Concept) {
  const attempts = node.attempts;
  const correct = attempts.filter((a) => a.correct);
  const days = new Set(correct.map((a) => new Date(a.at).toLocaleDateString('en-CA'))).size;
  const accuracy = attempts.length ? correct.length / attempts.length : 0;
  // Um erro em revisão espaçada devolve o conceito a "em estudo": só vale o que vem depois.
  let lastReviewFail = -1;
  attempts.forEach((a, i) => {
    if (!a.correct && a.mode === 'revisao') lastReviewFail = i;
  });
  const evidence = attempts.slice(lastReviewFail + 1).filter(isEvidence);
  const evidenceCount = evidence.length;
  const mastered =
    evidenceCount >= MASTERY_MIN_EVIDENCE &&
    calendarDay(evidence[evidenceCount - 1].at) - calendarDay(evidence[0].at) >=
      MASTERY_MIN_GAP_DAYS;
  const choiceDays = new Set(
    attempts
      .filter((a) => a.correct && !a.helped && a.kind === 'choice')
      .map((a) => new Date(a.at).toLocaleDateString('en-CA')),
  ).size;
  const fraction = attempts.length
    ? Math.min(0.95, (10 * Math.min(choiceDays, 3) + 40 * Math.min(evidenceCount, 2)) / 100)
    : 0;
  return { fraction, mastered, days, accuracy, evidenceCount };
}
export const RETRY_FEEDBACK_WINDOW_MS = 30 * 60 * 1000;
/** Nova tentativa logo após o feedback de um erro no mesmo tipo conta como ajudada. */
export function retryAfterFeedback(node: Concept, kind: AttemptKind, now = Date.now()): boolean {
  const last = node.attempts[node.attempts.length - 1];
  return !!last && !last.correct && last.kind === kind && now - last.at <= RETRY_FEEDBACK_WINDOW_MS;
}
export function recordAnswer(
  node: Concept,
  correct: boolean,
  kind: AttemptKind,
  score = Number(correct),
  now = Date.now(),
  sourceId?: string,
  extra: AttemptExtra = {},
): Concept {
  if (sourceId && node.attempts.some((a) => a.sourceId === sourceId)) return node;
  const attempt: Attempt = {
    at: now,
    correct,
    kind,
    score,
    sourceId,
    helped: extra.helped ?? false,
    ...(extra.mode ? { mode: extra.mode } : {}),
    ...(extra.confidence !== undefined ? { confidence: extra.confidence } : {}),
    ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
  };
  const attempts = [...node.attempts, attempt].slice(-200);
  const interval =
    correct && !attempt.helped
      ? Math.min(
          30,
          [1, 3, 7, 14, 30][
            Math.min(
              4,
              new Set(
                attempts
                  .filter((a) => a.correct && !a.helped)
                  .map((a) => new Date(a.at).toDateString()),
              ).size - 1,
            )
          ] || 1,
        )
      : 1;
  return { ...node, attempts, due: now + interval * 86400000 };
}
export { planStudy, recordSession, dateKey, courseProgress } from './planner';
