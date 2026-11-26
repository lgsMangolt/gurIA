// Apostila de um curso importado, montada a partir do que já está salvo (sem IA):
// capa, sumário com as aulas pendentes, uma seção por aula e o gabarito no fim.
import type { Workspace } from '../domain';
import type { Exercise } from '../exercises/schema';

export type Apostila = {
  title: string;
  origin?: string;
  license?: string;
  lessons: Array<{
    id: string;
    title: string;
    pending: boolean;
    summary?: string;
    concepts: Array<{ label: string; summary: string; note: string }>;
    exercises: Exercise[];
  }>;
  answers: Array<{ lessonTitle: string; items: string[] }>;
};

function answerOf(ex: Exercise): string {
  switch (ex.type) {
    case 'escolha':
      return ex.answerIndexes.map((i) => ex.options[i]).join(' / ');
    case 'ligar':
      return ex.pairs.map((p) => `${p.left} → ${p.right}`).join('; ');
    default:
      return `resposta livre (critérios: ${ex.rubric.map((r) => r.criterion).join('; ')})`;
  }
}

export function buildApostila(state: Workspace, courseId: string): Apostila {
  const course = state.courses.find((c) => c.id === courseId);
  if (!course) throw new Error('Curso não encontrado.');
  const answers: Apostila['answers'] = [];
  const lessons = (course.lessons ?? []).map((lesson) => {
    const concepts = state.concepts.filter(
      (c) => c.courseIds.includes(courseId) && c.id.startsWith(`${lesson.id}:`),
    );
    const exercises = concepts.flatMap((c) => c.exercises ?? []);
    if (exercises.length)
      answers.push({
        lessonTitle: lesson.title,
        items: exercises.map((ex, i) => `${i + 1}. ${answerOf(ex)}`),
      });
    return {
      id: lesson.id,
      title: lesson.title,
      pending: lesson.status !== 'processada',
      summary: lesson.summary,
      concepts: concepts.map((c) => ({ label: c.label, summary: c.summary, note: c.note })),
      exercises,
    };
  });
  return { title: course.title, origin: course.origin, license: course.license, lessons, answers };
}
