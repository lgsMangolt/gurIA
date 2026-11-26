import { recordAnswer, type Workspace } from '../domain';
import { AppError } from '../runtime/analysis';
import { exercisesOf } from './migrate';
import { attemptKindOf } from './schema';
import type { GradeResult, Submission } from './submissions-schema';

export const GRADE_PASS_SCORE = 0.8;
export const MAX_GRADE_TRIES = 3;
export const MAX_PENDING_DRAWINGS = 10;
export const KEEP_GRADED = 100;
// Corrigidos (até KEEP_GRADED) + não corrigidos precisam caber nos 300 do workspaceSchema.
export const MAX_QUEUED = 200;
export const NON_RETRYABLE = [
  'RESPOSTA_INVALIDA',
  'INVALID_API_KEY',
  'MODEL_UNAVAILABLE',
  'CODEX_MISSING',
  'CHATGPT_REQUIRED',
];

export type QueueInput = Omit<
  Submission,
  'state' | 'tries' | 'lastError' | 'result' | 'gradedAt' | 'helped'
> & { helped?: boolean };

const patch = (ws: Workspace, id: string, change: (s: Submission) => Submission): Workspace => ({
  ...ws,
  submissions: ws.submissions.map((s) => (s.id === id ? change(s) : s)),
});

export function queueSubmission(ws: Workspace, input: QueueInput): Workspace {
  if (ws.submissions.some((s) => s.id === input.id)) return ws;
  const concept = ws.concepts.find((c) => c.id === input.conceptId);
  if (!concept) throw new AppError(404, 'EXERCICIO_INEXISTENTE', 'Conceito inexistente.');
  const exercise = exercisesOf(concept).find((e) => e.id === input.exerciseId);
  if (!exercise) throw new AppError(404, 'EXERCICIO_INEXISTENTE', 'Exercício inexistente.');
  if (exercise.type !== input.answer.type)
    throw new AppError(400, 'RESPOSTA_INVALIDA', 'O tipo da resposta não é o do exercício.');
  if (ws.submissions.filter((s) => s.state !== 'corrigida').length >= MAX_QUEUED)
    throw new AppError(
      409,
      'FILA_CHEIA',
      'Há respostas demais aguardando correção. Reenvie ou descarte as pendentes antes de enviar outra.',
    );
  if (input.answer.type === 'desenho' && input.answer.image) {
    const pending = ws.submissions.filter(
      (s) => s.state !== 'corrigida' && s.answer.type === 'desenho' && s.answer.image,
    ).length;
    if (pending >= MAX_PENDING_DRAWINGS)
      throw new AppError(
        409,
        'FILA_CHEIA',
        'Há desenhos demais aguardando correção. Corrija ou reenvie os pendentes antes de enviar outro.',
      );
  }
  const submission: Submission = {
    ...input,
    helped: input.helped ?? false,
    state: 'pendente',
    tries: 0,
  };
  return { ...ws, submissions: [...ws.submissions, submission] };
}

export function markFailed(
  ws: Workspace,
  id: string,
  error: { code: string; message: string },
): Workspace {
  return patch(ws, id, (s) => {
    if (s.state === 'corrigida') return s;
    const tries = s.tries + 1;
    const hard = tries >= MAX_GRADE_TRIES || NON_RETRYABLE.includes(error.code);
    return { ...s, tries, lastError: error, state: hard ? 'falhou' : 'pendente' };
  });
}

export function markGraded(
  ws: Workspace,
  id: string,
  result: GradeResult,
  now = Date.now(),
): Workspace {
  const sub = ws.submissions.find((s) => s.id === id);
  if (!sub || sub.state === 'corrigida') return ws;
  const concept = ws.concepts.find((c) => c.id === sub.conceptId);
  const exercise = concept && exercisesOf(concept).find((e) => e.id === sub.exerciseId);
  const graded = patch(ws, id, (s) => ({
    ...s,
    state: 'corrigida',
    result,
    gradedAt: now,
    lastError: undefined,
    answer: s.answer.type === 'desenho' ? { type: 'desenho' } : s.answer,
  }));
  if (!concept || !exercise) return pruneSubmissions(graded);
  const updated = recordAnswer(
    concept,
    result.correct,
    attemptKindOf(exercise.type),
    result.score,
    now,
    'submission:' + id,
    { mode: sub.mode, helped: sub.helped, confidence: sub.confidence, sessionId: sub.sessionId },
  );
  return pruneSubmissions({
    ...graded,
    concepts: graded.concepts.map((c) => (c.id === concept.id ? updated : c)),
  });
}

export function resetForRetry(ws: Workspace, id: string): Workspace {
  return patch(ws, id, (s) =>
    s.state === 'corrigida' ? s : { ...s, state: 'pendente', tries: 0, lastError: undefined },
  );
}

export function removeSubmission(ws: Workspace, id: string): Workspace {
  const sub = ws.submissions.find((s) => s.id === id);
  if (!sub) throw new AppError(404, 'ENVIO_INEXISTENTE', 'Envio inexistente.');
  if (sub.state === 'corrigida')
    throw new AppError(409, 'JA_CORRIGIDA', 'Este envio já foi corrigido.');
  return { ...ws, submissions: ws.submissions.filter((s) => s.id !== id) };
}

export function pruneSubmissions(ws: Workspace): Workspace {
  const keep = new Set(
    ws.submissions
      .filter((s) => s.state === 'corrigida')
      .sort((a, b) => (b.gradedAt ?? 0) - (a.gradedAt ?? 0))
      .slice(0, KEEP_GRADED)
      .map((s) => s.id),
  );
  return {
    ...ws,
    submissions: ws.submissions.filter((s) => s.state !== 'corrigida' || keep.has(s.id)),
  };
}
