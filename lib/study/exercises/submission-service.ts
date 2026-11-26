import { z } from 'zod';
import { recordAnswer, retryAfterFeedback, type StudyMode, type Workspace } from '../domain';
import { AppError, providerError } from '../runtime/analysis';
import { gradeEscolha, gradeLigar } from './grade-local';
import { gradeWithAi, validateAnswer, type Generate } from './grade-ai';
import { isExpired } from '../sessions/session';
import { exercisesOf } from './migrate';
import { attemptKindOf, type Exercise } from './schema';
import {
  markFailed,
  markGraded,
  queueSubmission,
  removeSubmission,
  resetForRetry,
} from './submissions';
import {
  submissionAnswerSchema,
  type GradeResult,
  type SubmissionAnswer,
} from './submissions-schema';

export const GRADE_BATCH_LIMIT = 12;

/** Envios de uma Prova ainda ativa só são corrigidos depois de encerrar (feedback só no final). */
export const lockedByProva = (ws: Workspace, now: number) =>
  new Set(
    ws.studySessions
      .filter((s) => s.mode === 'prova' && s.state === 'ativa' && !isExpired(s, now))
      .map((s) => s.id),
  );
export const STOP_CODES = [
  'QUOTA_EXCEEDED',
  'SUBSCRIPTION_REQUIRED',
  'CHATGPT_REQUIRED',
  'INVALID_API_KEY',
  'CODEX_MISSING',
  'MODEL_UNAVAILABLE',
  'LIMIT_UNKNOWN',
  'CREDITS_DISABLED',
  'CODEX_BUSY',
  'CODEX_STOPPED',
  'CODEX_TIMEOUT',
  'PROVIDER_TIMEOUT',
];

export type Store = {
  load(): Promise<{ revision: number; data: Workspace }>;
  save(revision: number, data: Workspace): Promise<{ revision: number; data: Workspace }>;
};
export type Deps = { store: Store; generate: Generate; now?: () => number };
export type Harness = 'codex' | 'claude';
export type SubmitAnswer =
  | { type: 'escolha'; chosen: number[] }
  | { type: 'ligar'; matches: Record<string, string> }
  | SubmissionAnswer;
export type SubmitInput = {
  id: string;
  conceptId: string;
  exerciseId: string;
  harness: Harness;
  model?: string;
  answer: SubmitAnswer;
  mode?: StudyMode;
  sessionId?: string;
  helped?: boolean;
  confidence?: number;
  deferGrading?: boolean;
};
export type SubmitOutcome = {
  state: 'corrigida' | 'pendente' | 'falhou';
  result?: GradeResult;
  error?: { code: string; message: string };
  revision: number;
};

const invalid = (message: string) => new AppError(400, 'RESPOSTA_INVALIDA', message);
const asError = (e: unknown) => {
  const err = providerError(e);
  return { code: err.code, message: err.message };
};

/** Lê, aplica a transição pura e grava; em conflito de revisão relê e reaplica uma vez. */
export async function mutate(store: Store, change: (ws: Workspace) => Workspace) {
  for (let attempt = 0; ; attempt++) {
    const { revision, data } = await store.load();
    try {
      return await store.save(revision, change(data));
    } catch (e) {
      if (!(e instanceof AppError && e.status === 409 && attempt === 0)) throw e;
    }
  }
}

async function gradeSubmission(
  deps: Deps,
  id: string,
  harness: Harness,
  model?: string,
): Promise<SubmitOutcome> {
  const now = deps.now ?? Date.now;
  const { revision, data } = await deps.store.load();
  const sub = data.submissions.find((s) => s.id === id);
  if (!sub) throw new AppError(404, 'ENVIO_INEXISTENTE', 'Envio inexistente.');
  if (sub.state === 'corrigida') return { state: 'corrigida', result: sub.result, revision };
  const concept = data.concepts.find((c) => c.id === sub.conceptId);
  const exercise = concept && exercisesOf(concept).find((e) => e.id === sub.exerciseId);
  if (!concept || !exercise || (exercise.type !== 'escrita' && exercise.type !== 'desenho'))
    throw new AppError(404, 'EXERCICIO_INEXISTENTE', 'Exercício inexistente.');
  const ctx = {
    label: concept.label,
    summary: concept.summary.slice(0, 20000),
    note: concept.note.slice(0, 20000),
  };
  let result: GradeResult;
  try {
    result = await gradeWithAi({
      exercise,
      answer: sub.answer,
      ctx,
      generate: deps.generate,
      harness,
      model,
    });
  } catch (e) {
    const error = asError(e);
    try {
      const saved = await mutate(deps.store, (ws) => markFailed(ws, id, error));
      const state = saved.data.submissions.find((s) => s.id === id)?.state;
      return { state: state === 'falhou' ? 'falhou' : 'pendente', error, revision: saved.revision };
    } catch (saveError) {
      if (saveError instanceof AppError && saveError.status === 409)
        return { state: 'pendente', error, revision };
      throw saveError;
    }
  }
  try {
    const saved = await mutate(deps.store, (ws) => markGraded(ws, id, result, now()));
    return { state: 'corrigida', result, revision: saved.revision };
  } catch (e) {
    if (e instanceof AppError && e.status === 409)
      return {
        state: 'pendente',
        error: { code: 'REVISION_CONFLICT', message: e.message },
        revision,
      };
    throw e;
  }
}

const chosenSchema = z.array(z.number().int().min(0)).max(10);
const matchesSchema = z.record(z.string().max(500), z.string().max(500));

export async function submitExercise(deps: Deps, input: SubmitInput): Promise<SubmitOutcome> {
  const now = deps.now ?? Date.now;
  const { data } = await deps.store.load();
  const concept = data.concepts.find((c) => c.id === input.conceptId);
  if (!concept) throw new AppError(404, 'EXERCICIO_INEXISTENTE', 'Conceito inexistente.');
  const exercise: Exercise | undefined = exercisesOf(concept).find(
    (e) => e.id === input.exerciseId,
  );
  if (!exercise) throw new AppError(404, 'EXERCICIO_INEXISTENTE', 'Exercício inexistente.');
  if (input.answer.type !== exercise.type)
    throw invalid('O tipo da resposta não é o do exercício.');
  const kind = attemptKindOf(exercise.type);
  const helped = input.helped ?? retryAfterFeedback(concept, kind, now());
  const extra = {
    mode: input.mode,
    helped,
    confidence: input.confidence,
    sessionId: input.sessionId,
  };

  if (exercise.type === 'escolha' || exercise.type === 'ligar') {
    let grade;
    if (exercise.type === 'escolha' && input.answer.type === 'escolha') {
      const chosen = chosenSchema.safeParse(input.answer.chosen);
      if (!chosen.success) throw invalid('Resposta inválida.');
      grade = gradeEscolha(exercise, chosen.data);
    } else if (exercise.type === 'ligar' && input.answer.type === 'ligar') {
      const matches = matchesSchema.safeParse(input.answer.matches);
      if (!matches.success) throw invalid('Resposta inválida.');
      grade = gradeLigar(exercise, matches.data);
    } else throw invalid('O tipo da resposta não é o do exercício.');
    const saved = await mutate(deps.store, (ws) => ({
      ...ws,
      concepts: ws.concepts.map((c) =>
        c.id === concept.id
          ? recordAnswer(
              c,
              grade.correct,
              kind,
              grade.score,
              now(),
              'submission:' + input.id,
              extra,
            )
          : c,
      ),
    }));
    return {
      state: 'corrigida',
      result: { ...grade, feedback: '', missing: [], criteria: [] },
      revision: saved.revision,
    };
  }

  const parsed = submissionAnswerSchema.safeParse(input.answer);
  if (!parsed.success) throw invalid('Resposta inválida.');
  validateAnswer(exercise, parsed.data);
  const queued = await mutate(deps.store, (ws) =>
    queueSubmission(ws, {
      id: input.id,
      conceptId: input.conceptId,
      exerciseId: input.exerciseId,
      sessionId: input.sessionId,
      mode: input.mode,
      helped,
      confidence: input.confidence,
      createdAt: now(),
      answer: parsed.data,
    }),
  );
  if (input.deferGrading) return { state: 'pendente', revision: queued.revision };
  return gradeSubmission(deps, input.id, input.harness, input.model);
}

export async function regradeSubmission(
  deps: Deps,
  args: { id: string; harness: Harness; model?: string },
): Promise<SubmitOutcome> {
  const { data } = await deps.store.load();
  const sub = data.submissions.find((s) => s.id === args.id);
  if (!sub) throw new AppError(404, 'ENVIO_INEXISTENTE', 'Envio inexistente.');
  if (sub.state === 'corrigida')
    throw new AppError(409, 'JA_CORRIGIDA', 'Este envio já foi corrigido.');
  if (sub.sessionId && lockedByProva(data, (deps.now ?? Date.now)()).has(sub.sessionId))
    throw new AppError(
      409,
      'SESSAO_ATIVA_NAO_CORRIGE',
      'Encerre a prova antes de pedir a correção.',
    );
  await mutate(deps.store, (ws) => resetForRetry(ws, args.id));
  return gradeSubmission(deps, args.id, args.harness, args.model);
}

export async function discardSubmission(deps: Deps, args: { id: string }) {
  const { data } = await deps.store.load();
  removeSubmission(data, args.id); // valida: existe e ainda não foi corrigido
  const saved = await mutate(deps.store, (ws) => removeSubmission(ws, args.id));
  return { revision: saved.revision };
}

export async function gradePendingBatch(
  deps: Deps,
  args: { ids?: string[]; harness: Harness; model?: string },
) {
  const { data } = await deps.store.load();
  const locked = lockedByProva(data, (deps.now ?? Date.now)());
  const candidates = data.submissions
    .filter(
      (s) =>
        s.state === 'pendente' &&
        !(s.sessionId && locked.has(s.sessionId)) &&
        (!args.ids || args.ids.includes(s.id)),
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  const outcomes: Record<string, SubmitOutcome> = {};
  let stoppedBy: string | undefined;
  for (const sub of candidates.slice(0, GRADE_BATCH_LIMIT)) {
    const outcome = await gradeSubmission(deps, sub.id, args.harness, args.model);
    outcomes[sub.id] = outcome;
    if (outcome.error && STOP_CODES.includes(outcome.error.code)) {
      stoppedBy = outcome.error.code;
      break;
    }
  }
  const after = (await deps.store.load()).data.submissions;
  const ids = new Set(candidates.map((s) => s.id));
  const states = after.filter((s) => ids.has(s.id)).map((s) => s.state);
  return {
    graded: states.filter((s) => s === 'corrigida').length,
    pending: states.filter((s) => s === 'pendente').length,
    failed: states.filter((s) => s === 'falhou').length,
    ...(stoppedBy ? { stoppedBy } : {}),
    outcomes,
  };
}

export function estimateBatch(ws: Workspace, ids?: string[]) {
  const pending = ws.submissions.filter(
    (s) => s.state === 'pendente' && (!ids || ids.includes(s.id)),
  );
  const drawings = pending.filter((s) => s.answer.type === 'desenho').length;
  const writings = pending.length - drawings;
  return {
    writings,
    drawings,
    total: pending.length,
    overLimit: pending.length > GRADE_BATCH_LIMIT,
  };
}
