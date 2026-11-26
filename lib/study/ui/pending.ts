import { costNotice, practiceCopy, STATE_LABELS } from './copy';
import { friendlyError } from './errors';

export type PendingItem = {
  id: string;
  conceptId: string;
  exerciseId: string;
  state: 'pendente' | 'falhou' | 'corrigida';
  tries: number;
  lastError?: { code: string; message: string };
  createdAt: number;
  waitingProva?: boolean;
};
export type PendingEstimate = {
  writings: number;
  drawings: number;
  total: number;
  overLimit: boolean;
};

export const canRegrade = (state: PendingItem['state']): boolean =>
  state === 'pendente' || state === 'falhou';

export const pendingActions = (item: PendingItem): ('regrade' | 'discard')[] =>
  item.waitingProva || !canRegrade(item.state) ? [] : ['regrade', 'discard'];

export function describePending(items: PendingItem[], estimate: PendingEstimate) {
  return {
    title: items.length
      ? `${items.length} ${items.length === 1 ? 'resposta aguardando' : 'respostas aguardando'} correção`
      : 'Nenhuma resposta pendente',
    rows: items.map((item) => ({
      id: item.id,
      stateLabel: STATE_LABELS[item.state],
      detail: item.waitingProva
        ? practiceCopy.waitingProva
        : item.lastError
          ? friendlyError(item.lastError.code, item.lastError.message)
          : item.state === 'pendente'
            ? 'Aguardando correção'
            : '',
    })),
    notice: costNotice(estimate),
  };
}
