import { mastery, type Concept } from './domain';

/** Regra antiga de domínio, mantida só para comparar o antes e o depois. */
export function legacyMastered(node: Concept): boolean {
  const correct = node.attempts.filter((a) => a.correct);
  const days = new Set(correct.map((a) => new Date(a.at).toLocaleDateString('en-CA'))).size;
  const applied = correct.some((a) => a.kind !== 'choice');
  const accuracy = node.attempts.length ? correct.length / node.attempts.length : 0;
  return days >= 3 && applied && accuracy >= 0.8;
}

export function compareMastery(concepts: Concept[]) {
  const lost: string[] = [];
  const gained: string[] = [];
  let before = 0;
  let after = 0;
  for (const c of concepts) {
    const was = legacyMastered(c);
    const now = mastery(c).mastered;
    if (was) before++;
    if (now) after++;
    if (was && !now) lost.push(c.label);
    if (!was && now) gained.push(c.label);
  }
  return { total: concepts.length, before, after, lost, gained };
}
