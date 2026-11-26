import type { StudySession } from '../sessions/session-schema';

export const clockSkew = (serverNow: number, clientNow: number): number => serverNow - clientNow;

/** Tempo restante da Prova pelo relógio do servidor; `null` fora da Prova. Nunca negativo. */
export function remainingMs(session: StudySession, clientNow: number, skew: number): number | null {
  if (session.mode !== 'prova' || session.deadlineAt === undefined) return null;
  return Math.max(0, session.deadlineAt - (clientNow + skew));
}

export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export function timerWarning(ms: number): 'ok' | 'cinco' | 'um' | 'zero' {
  if (ms <= 0) return 'zero';
  if (ms <= 60000) return 'um';
  if (ms <= 300000) return 'cinco';
  return 'ok';
}

/** Id de resposta determinístico: duplo clique ou reenvio não gravam duas respostas. */
export const itemId = (sessionId: string, index: number): string => `${sessionId}:${index}`;
