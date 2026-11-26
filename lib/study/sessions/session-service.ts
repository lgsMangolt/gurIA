import type { StudyMode } from '../domain';
import {
  estimateBatch,
  gradePendingBatch,
  mutate,
  submitExercise,
  type Deps,
  type Harness,
  type SubmitInput,
  type SubmitOutcome,
} from '../exercises/submission-service';
import { AppError } from '../runtime/analysis';
import { selectItems } from './select';
import type { StudySession } from './session-schema';
import {
  createSession,
  expireStale,
  finishSession,
  isExpired,
  markAnswered,
  unmarkAnswered,
} from './session';

const clock = (deps: Deps) => (deps.now ?? Date.now)();
const notFound = () => new AppError(404, 'SESSAO_INEXISTENTE', 'Sessão inexistente.');

export async function startStudySession(
  deps: Deps,
  args: { id: string; mode: StudyMode; conceptIds?: string[] },
): Promise<{ session: StudySession; revision: number }> {
  const now = clock(deps);
  const { data } = await deps.store.load();
  const existing = data.studySessions.find((s) => s.id === args.id);
  if (existing) return { session: existing, revision: (await deps.store.load()).revision };
  const { items, limitMinutes } = selectItems(data, {
    mode: args.mode,
    conceptIds: args.conceptIds,
    now,
  });
  const saved = await mutate(deps.store, (ws) =>
    createSession(ws, { id: args.id, mode: args.mode, items, limitMinutes, now }),
  );
  const session = saved.data.studySessions.find((s) => s.id === args.id);
  if (!session) throw notFound();
  return { session, revision: saved.revision };
}

type AnswerBody = Pick<
  SubmitInput,
  'id' | 'conceptId' | 'exerciseId' | 'harness' | 'model' | 'answer' | 'helped' | 'confidence'
>;

/** O modo e o sessionId vêm da sessão no servidor: nunca do corpo do pedido. */
export async function answerInSession(
  deps: Deps,
  args: { sessionId: string; answer: AnswerBody },
): Promise<SubmitOutcome> {
  const now = clock(deps);
  const { sessionId, answer } = args;
  const { data } = await deps.store.load();
  const session = data.studySessions.find((s) => s.id === sessionId);
  if (!session) throw notFound();
  // O carimbo vem ANTES da resposta: dois envios do mesmo item não passam juntos e encerrar a
  // sessão no meio nunca deixa uma resposta sem carimbo. Se a resposta falhar, o carimbo é desfeito.
  try {
    await mutate(deps.store, (ws) =>
      markAnswered(ws, sessionId, answer.conceptId, answer.exerciseId, now),
    );
  } catch (e) {
    if (e instanceof AppError && (e.code === 'PROVA_ENCERRADA' || e.code === 'SESSAO_ENCERRADA'))
      await mutate(deps.store, (ws) => expireStale(ws, now)).catch(() => undefined);
    throw e;
  }
  let outcome: SubmitOutcome;
  try {
    outcome = await submitExercise(
      { ...deps, now: () => now },
      {
        id: answer.id,
        conceptId: answer.conceptId,
        exerciseId: answer.exerciseId,
        harness: answer.harness,
        model: answer.model,
        answer: answer.answer,
        helped: answer.helped,
        confidence: answer.confidence,
        mode: session.mode,
        sessionId,
        deferGrading: session.mode === 'prova',
      },
    );
  } catch (e) {
    await mutate(deps.store, (ws) =>
      unmarkAnswered(ws, sessionId, answer.conceptId, answer.exerciseId),
    ).catch(() => undefined);
    throw e;
  }
  if (session.mode === 'prova') {
    const { result: _hidden, ...rest } = outcome;
    return rest;
  }
  return outcome;
}

export async function finishAndSummarize(deps: Deps, args: { sessionId: string }) {
  const now = clock(deps);
  const saved = await mutate(deps.store, (ws) => finishSession(ws, args.sessionId, now));
  const ws = saved.data;
  const session = ws.studySessions.find((s) => s.id === args.sessionId);
  if (!session) throw notFound();
  const attempts = ws.concepts.flatMap((c) => c.attempts).filter((a) => a.sessionId === session.id);
  const subs = ws.submissions.filter((s) => s.sessionId === session.id);
  const summary = {
    total: session.items.length,
    answered: session.items.filter((i) => i.answeredAt !== undefined).length,
    correct: attempts.filter((a) => a.correct).length,
    pending: subs.filter((s) => s.state === 'pendente').length,
    failed: subs.filter((s) => s.state === 'falhou').length,
  };
  return {
    session,
    summary,
    estimate: estimateBatch(
      ws,
      subs.map((s) => s.id),
    ),
  };
}

export async function gradeSession(
  deps: Deps,
  args: { sessionId: string; harness: Harness; model?: string },
) {
  const now = clock(deps);
  const { data } = await deps.store.load();
  const session = data.studySessions.find((s) => s.id === args.sessionId);
  if (!session) throw notFound();
  if (session.state === 'ativa' && !isExpired(session, now))
    throw new AppError(
      409,
      'SESSAO_ATIVA_NAO_CORRIGE',
      'Encerre a sessão antes de pedir a correção.',
    );
  const ids = data.submissions.filter((s) => s.sessionId === session.id).map((s) => s.id);
  return gradePendingBatch(deps, { ids, harness: args.harness, model: args.model });
}

export async function getSession(deps: Deps, args: { sessionId: string }): Promise<StudySession> {
  const now = clock(deps);
  const { data } = await deps.store.load();
  const fresh = expireStale(data, now);
  const saved = fresh === data ? { data } : await mutate(deps.store, (ws) => expireStale(ws, now));
  const session = saved.data.studySessions.find((s) => s.id === args.sessionId);
  if (!session) throw notFound();
  return session;
}
