// Leva para o workspace só os conceitos aprovados de uma aula processada.
// Aprovar não concede domínio: attempts vazio e due 0 para conceitos novos.
import type { Concept, Workspace } from '../domain';
import type { LessonResult } from './lesson-analysis';

export function incorporateLesson(
  state: Workspace,
  courseId: string,
  lessonId: string,
  result: LessonResult,
  approvedIds: string[],
): Workspace {
  const approved = result.concepts.filter((c) => approvedIds.includes(c.id));
  const concepts = [...state.concepts];
  for (const c of approved) {
    const terms = c.originalTerms.length
      ? `\n\nTermos do original: ${c.originalTerms.join(', ')}`
      : '';
    const fields = {
      label: c.label.slice(0, 160),
      summary: c.summary.slice(0, 20000),
      note: `${c.note}${terms}`.slice(0, 100000),
      exercises: c.exercises.slice(0, 30),
      evidence: [
        {
          text: c.evidence,
          start: c.startSeconds ?? 0,
          end: c.endSeconds ?? c.startSeconds ?? 0,
          courseId,
        },
      ],
    };
    const index = concepts.findIndex((n) => n.id === c.id);
    if (index >= 0)
      concepts[index] = {
        ...concepts[index],
        ...fields,
        courseIds: [...new Set([...concepts[index].courseIds, courseId])],
      };
    else
      concepts.push({
        id: c.id,
        ...fields,
        courseIds: [courseId],
        origin: 'lesson',
        attempts: [],
        due: 0,
      } satisfies Concept);
  }
  const ids = new Set(approved.map((c) => c.id));
  const connections = [...state.connections];
  for (const link of result.connections)
    if (
      ids.has(link.source) &&
      ids.has(link.target) &&
      !connections.some((e) => e.source === link.source && e.target === link.target)
    )
      connections.push({
        id: `${link.source}->${link.target}`,
        source: link.source,
        target: link.target,
        relation: link.relationship,
      });
  const courses = state.courses.map((course) =>
    course.id !== courseId
      ? course
      : {
          ...course,
          lessons: (course.lessons ?? []).map((l) =>
            l.id === lessonId
              ? { ...l, summary: result.summary.slice(0, 20000), status: 'processada' as const }
              : l,
          ),
        },
  );
  return { ...state, concepts, connections, courses };
}
