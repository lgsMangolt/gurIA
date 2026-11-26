import type { StudyMode } from '../domain';
import type { Exercise, ExerciseType } from '../exercises/schema';
import type { StudySession } from '../sessions/session-schema';
import { itemId } from './timer';

export type Draft =
  | { type: 'escolha'; chosen: number[] }
  | { type: 'ligar'; matches: Record<string, string>; total: number }
  | { type: 'escrita'; text: string }
  | { type: 'desenho'; image?: string };

export type AnswerBody = {
  sessionId: string;
  id: string;
  conceptId: string;
  exerciseId: string;
  confidence: number;
  answer:
    | { type: 'escolha'; chosen: number[] }
    | { type: 'ligar'; matches: Record<string, string> }
    | { type: 'escrita'; text: string }
    | { type: 'desenho'; image: string };
};

const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

/** Corpo de `session-answer`. O modo, a sessão de envio e o adiamento são do servidor: nunca vão no corpo. */
export function buildAnswerPayload(args: {
  sessionId: string;
  index: number;
  conceptId: string;
  exercise: Exercise;
  draft: Draft;
  confidence: number | undefined;
}): { body: AnswerBody } | { error: string } {
  const { sessionId, index, conceptId, exercise, draft, confidence } = args;
  if (confidence === undefined) return { error: 'Marque sua confiança antes de responder.' };
  if (draft.type !== exercise.type) return { error: 'A resposta não corresponde ao exercício.' };
  const head = {
    sessionId,
    id: itemId(sessionId, index),
    conceptId,
    exerciseId: exercise.id,
    confidence,
  };
  switch (draft.type) {
    case 'escolha':
      if (!draft.chosen.length) return { error: 'Escolha pelo menos uma opção.' };
      return { body: { ...head, answer: { type: 'escolha', chosen: draft.chosen } } };
    case 'ligar':
      if (Object.keys(draft.matches).length !== draft.total)
        return { error: 'Ligue todos os itens antes de responder.' };
      return { body: { ...head, answer: { type: 'ligar', matches: draft.matches } } };
    case 'escrita': {
      const min = Math.max(exercise.type === 'escrita' ? exercise.minChars : 0, 1);
      if (draft.text.trim().length < min)
        return {
          error:
            min > 1
              ? `Escreva pelo menos ${min} caracteres antes de enviar.`
              : 'Escreva sua resposta antes de enviar.',
        };
      return { body: { ...head, answer: { type: 'escrita', text: draft.text } } };
    }
    case 'desenho':
      if (!draft.image || !IMAGE_RE.test(draft.image))
        return { error: 'Faça um desenho antes de enviar.' };
      return { body: { ...head, answer: { type: 'desenho', image: draft.image } } };
  }
}

export const requiresCostConfirmation = (mode: StudyMode, type: ExerciseType): boolean =>
  type === 'desenho' && mode !== 'prova';

/** Índice do primeiro item sem resposta (retomada de sessão); -1 quando todos foram respondidos. */
export const nextPendingIndex = (session: StudySession): number =>
  session.items.findIndex((item) => item.answeredAt === undefined);

export function sessionSummaryView(
  summary: { total: number; answered: number; correct: number; pending: number; failed: number },
  mode: StudyMode,
  ended: boolean,
) {
  return { ...summary, correct: mode === 'prova' && !ended ? undefined : summary.correct };
}

/** Próximo item sem resposta depois de `from`; se não houver, o primeiro pulado antes dele; -1 se não houver mais. */
export function nextUnansweredIndex(items: { answeredAt?: number }[], from: number): number {
  const ahead = items.findIndex((item, i) => i > from && item.answeredAt === undefined);
  if (ahead !== -1) return ahead;
  return items.findIndex((item, i) => i < from && item.answeredAt === undefined);
}

/** O fim automático da Prova só dispara no zero, sem envio em andamento e uma única vez. */
export const shouldAutoFinish = (args: {
  remaining: number | null;
  busy: boolean;
  fired: boolean;
}): boolean => args.remaining === 0 && !args.busy && !args.fired;
