import type { StudyMode, Workspace } from '../domain';
import { AppError } from '../runtime/analysis';
import type { StudySession } from './session-schema';

export const SESSION_IDLE_MS = 12 * 3600 * 1000;
export const PROVA_TOLERANCE_MS = 60000;
export const MAX_ITEMS: Record<StudyMode, number> = {
  rapido: 10,
  aprofundar: 6,
  prova: 10,
  revisao: 8,
};
export const RAPIDO_MAX_MINUTES = 20;
export const PROVA_MIN_MINUTES = 10;
export const PROVA_MAX_MINUTES = 90;
export const ESTIMATE_MINUTES = { escolha: 1, ligar: 2, desenho: 6, escrita: 5 } as const;
export const KEEP_ENDED_SESSIONS = 50;

const fail = (status: number, code: string, message: string) => new AppError(status, code, message);

const lastActivity = (s: StudySession) =>
  Math.max(s.startedAt, ...s.items.map((i) => i.answeredAt ?? 0));
const provaLate = (s: StudySession, now: number) =>
  s.mode === 'prova' && s.deadlineAt !== undefined && now > s.deadlineAt + PROVA_TOLERANCE_MS;

export function isExpired(s: StudySession, now: number): boolean {
  return provaLate(s, now) || now - lastActivity(s) > SESSION_IDLE_MS;
}

export function expireStale(ws: Workspace, now: number): Workspace {
  if (!ws.studySessions.some((s) => s.state === 'ativa' && isExpired(s, now))) return ws;
  return {
    ...ws,
    studySessions: ws.studySessions.map((s) =>
      s.state === 'ativa' && isExpired(s, now) ? { ...s, state: 'expirada', endedAt: now } : s,
    ),
  };
}

export function activeSession(ws: Workspace, now: number): StudySession | undefined {
  return ws.studySessions.find((s) => s.state === 'ativa' && !isExpired(s, now));
}

export function pruneSessions(ws: Workspace): Workspace {
  const keep = new Set(
    ws.studySessions
      .filter((s) => s.state !== 'ativa')
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
      .slice(0, KEEP_ENDED_SESSIONS)
      .map((s) => s.id),
  );
  return {
    ...ws,
    studySessions: ws.studySessions.filter((s) => s.state === 'ativa' || keep.has(s.id)),
  };
}

export function createSession(
  ws: Workspace,
  input: {
    id: string;
    mode: StudyMode;
    items: { conceptId: string; exerciseId: string }[];
    limitMinutes?: number;
    now: number;
  },
): Workspace {
  if (ws.studySessions.some((s) => s.id === input.id)) return ws;
  const fresh = expireStale(ws, input.now);
  if (activeSession(fresh, input.now))
    throw fail(
      409,
      'SESSAO_ATIVA',
      'Já existe uma sessão em andamento. Encerre-a antes de começar outra.',
    );
  const session: StudySession = {
    id: input.id,
    mode: input.mode,
    state: 'ativa',
    startedAt: input.now,
    items: input.items.map((i) => ({ conceptId: i.conceptId, exerciseId: i.exerciseId })),
    ...(input.mode === 'prova' && input.limitMinutes
      ? { limitMinutes: input.limitMinutes, deadlineAt: input.now + input.limitMinutes * 60000 }
      : {}),
  };
  return pruneSessions({ ...fresh, studySessions: [...fresh.studySessions, session] });
}

export function markAnswered(
  ws: Workspace,
  sessionId: string,
  conceptId: string,
  exerciseId: string,
  now: number,
): Workspace {
  const session = ws.studySessions.find((s) => s.id === sessionId);
  if (!session) throw fail(404, 'SESSAO_INEXISTENTE', 'Sessão inexistente.');
  if (session.state === 'ativa' && provaLate(session, now))
    throw fail(409, 'PROVA_ENCERRADA', 'O prazo da prova terminou. Esta resposta não foi aceita.');
  if (session.state !== 'ativa' || isExpired(session, now))
    throw fail(409, 'SESSAO_ENCERRADA', 'Esta sessão já foi encerrada.');
  const item = session.items.find((i) => i.conceptId === conceptId && i.exerciseId === exerciseId);
  if (!item) throw fail(404, 'ITEM_FORA_DA_SESSAO', 'Este exercício não faz parte da sessão.');
  if (item.answeredAt !== undefined)
    throw fail(409, 'ITEM_JA_RESPONDIDO', 'Este exercício já foi respondido nesta sessão.');
  return {
    ...ws,
    studySessions: ws.studySessions.map((s) =>
      s.id === sessionId
        ? { ...s, items: s.items.map((i) => (i === item ? { ...i, answeredAt: now } : i)) }
        : s,
    ),
  };
}

/** Desfaz o carimbo quando a resposta não pôde ser gravada (resposta inválida, falha ao salvar). */
export function unmarkAnswered(
  ws: Workspace,
  sessionId: string,
  conceptId: string,
  exerciseId: string,
): Workspace {
  return {
    ...ws,
    studySessions: ws.studySessions.map((s) =>
      s.id === sessionId
        ? {
            ...s,
            items: s.items.map((i) =>
              i.conceptId === conceptId && i.exerciseId === exerciseId
                ? { ...i, answeredAt: undefined }
                : i,
            ),
          }
        : s,
    ),
  };
}

export function finishSession(ws: Workspace, sessionId: string, now: number): Workspace {
  const session = ws.studySessions.find((s) => s.id === sessionId);
  if (!session) throw fail(404, 'SESSAO_INEXISTENTE', 'Sessão inexistente.');
  if (session.state !== 'ativa') return ws;
  return pruneSessions({
    ...ws,
    studySessions: ws.studySessions.map((s) =>
      s.id === sessionId ? { ...s, state: 'encerrada', endedAt: now } : s,
    ),
  });
}
