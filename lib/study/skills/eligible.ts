import { mastery, type Concept, type Workspace } from '../domain';

/** Dominado sem ajuda e com a última tentativa certa. */
export function isEligible(c: Concept): boolean {
  return mastery(c).mastered && c.attempts.at(-1)?.correct === true;
}

export function eligibleConcepts(ws: Workspace): Concept[] {
  return ws.concepts.filter(isEligible).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export function explainIneligible(c: Concept): string {
  if (!c.attempts.length) return 'Em estudo: ainda sem tentativas.';
  if (!mastery(c).mastered)
    return 'Em estudo: faltam duas demonstrações sem ajuda com pelo menos 3 dias de intervalo.';
  if (c.attempts.at(-1)?.correct !== true) return 'Em estudo: a última resposta foi um erro.';
  return 'Elegível.';
}
