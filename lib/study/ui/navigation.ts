// Regras puras da navegação do app de estudo e da entrada no Praticar.
import type { Concept, StudyMode } from '../domain';
import { exercisesOf } from '../exercises/migrate';

export const STUDY_TABS = [
  'studies',
  'chat',
  'network',
  'materials',
  'courses',
  'praticar',
  'skills',
  'entrevista',
  'plan',
  'settings',
] as const;
export type StudyTab = (typeof STUDY_TABS)[number];
export type StudyScreen = { tab: StudyTab; reading: string; course: string };
export type StudyEntry = { session: string; index: number; screen: StudyScreen };

/**
 * Lê uma entrada salva no histórico do navegador. Entradas antigas da aba
 * Biblioteca (`tab: 'library'`) ou do player de quiz (`practice: {...}`)
 * viram a aba Praticar; qualquer outra coisa inválida devolve null.
 */
export function normalizeEntry(value: any): StudyEntry | null {
  if (typeof value?.session !== 'string' || !Number.isInteger(value.index) || value.index < 0)
    return null;
  const screen = value.screen;
  if (typeof screen?.reading !== 'string' || typeof screen?.course !== 'string') return null;
  const legacyPlayer = screen.practice != null;
  const tab = screen.tab === 'library' || legacyPlayer ? 'praticar' : screen.tab;
  if (!STUDY_TABS.includes(tab)) return null;
  return {
    session: value.session,
    index: value.index,
    screen: { tab, reading: screen.reading, course: screen.course },
  };
}

/** Aba pedida na URL (?tab=), com a Biblioteca antiga levando ao Praticar. */
export function tabFromQuery(tab: string | null): StudyTab {
  if (tab === 'library') return 'praticar';
  return STUDY_TABS.includes(tab as StudyTab) ? (tab as StudyTab) : 'studies';
}

/**
 * O que o botão Revisar abre no Praticar para estes conceitos: Revisão espaçada
 * com os vencidos, ou Rápido com todos que têm exercício. null quando nenhum
 * conceito tem exercício. Só pré-seleciona; quem começa a sessão é o aluno.
 */
export function reviewTarget(
  concepts: Concept[],
  now: number,
): { mode: StudyMode; conceptIds: string[] } | null {
  const practicable = concepts.filter((c) => exercisesOf(c).length > 0);
  if (!practicable.length) return null;
  const due = practicable.filter((c) => c.due <= now);
  return due.length
    ? { mode: 'revisao', conceptIds: due.map((c) => c.id) }
    : { mode: 'rapido', conceptIds: practicable.map((c) => c.id) };
}

/**
 * Praticar logo depois de aprovar uma aula importada: os conceitos da aula que têm
 * exercício, sempre no modo Rápido (recém-aprovados têm due 0, e o reviewTarget os
 * mandaria para a Revisão espaçada). Cerca de 1 minuto por conceito, no mínimo 3.
 */
export function lessonPracticeTarget(
  concepts: Concept[],
  lessonId: string,
): { mode: 'rapido'; conceptIds: string[]; minutes: number } | null {
  const ids = concepts
    .filter((c) => c.id.startsWith(`${lessonId}:`) && exercisesOf(c).length > 0)
    .map((c) => c.id);
  if (!ids.length) return null;
  return { mode: 'rapido', conceptIds: ids, minutes: Math.max(3, ids.length) };
}
