import type { Exercise } from './schema';

export type LocalGrade = { correct: boolean; score: number };

export function gradeEscolha(
  exercise: Extract<Exercise, { type: 'escolha' }>,
  chosen: number[],
): LocalGrade {
  const picked = new Set(chosen);
  const expected = new Set(exercise.answerIndexes);
  const correct = picked.size === expected.size && [...expected].every((i) => picked.has(i));
  return { correct, score: correct ? 1 : 0 };
}

export function gradeLigar(
  exercise: Extract<Exercise, { type: 'ligar' }>,
  matches: Record<string, string>,
): LocalGrade {
  const right = exercise.pairs.filter((p) =>
    Object.prototype.hasOwnProperty.call(matches, p.left) ? matches[p.left] === p.right : false,
  ).length;
  return { correct: right === exercise.pairs.length, score: right / exercise.pairs.length };
}
