import type { Concept, Workspace } from '../domain';
import { escolhaSchema, type Exercise } from './schema';

export function exercisesOf(concept: Concept): Exercise[] {
  if (concept.exercises?.length) return concept.exercises;
  const q = concept.question;
  if (!q) return [];
  // A pergunta antiga não tem limites; se o novo schema a recusar, ela segue só como `question`.
  const derived = escolhaSchema.safeParse({
    type: 'escolha',
    id: `escolha:${concept.id}`,
    prompt: q.question,
    options: q.options,
    answerIndexes: [q.answerIndex],
    explanation: q.explanation,
  });
  return derived.success ? [derived.data] : [];
}

// Mantém `question` no conceito: é o dado original (e o backup antigo o traz).
export function materializeExercises(workspace: Workspace): Workspace {
  return {
    ...workspace,
    concepts: workspace.concepts.map((c) => {
      if (c.exercises.length || !c.question) return c;
      const exercises = exercisesOf(c);
      return exercises.length ? { ...c, exercises } : c;
    }),
  };
}
