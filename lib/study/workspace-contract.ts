import type { Workspace } from './domain';

/** O que o cliente recebe: respostas (texto e imagem) ficam só no servidor. */
export function redactForClient(ws: Workspace): Workspace {
  return {
    ...ws,
    submissions: ws.submissions.map((s) => ({
      ...s,
      answer:
        s.answer.type === 'desenho'
          ? { type: 'desenho' as const }
          : { type: 'escrita' as const, text: '(guardada no servidor)' },
    })),
  };
}

/** `submissions` e `studySessions` pertencem ao servidor: o PUT do cliente não os reescreve. */
export function mergeServerOwned(incoming: unknown, current: Workspace): unknown {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  return {
    ...(incoming as Record<string, unknown>),
    submissions: current.submissions,
    studySessions: current.studySessions,
  };
}
