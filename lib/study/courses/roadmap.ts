// Edição do roteiro: reordenar, renomear, juntar e remover aulas de um curso importado.
import type { Course } from '../domain';
import { AppError } from '../runtime/analysis';
import type { ImportSource } from './types';

export type RoadmapLesson = { id: string; title: string; sourceIds: string[] };

export function applyRoadmap(
  course: Course,
  sources: Record<string, ImportSource>,
  edits: RoadmapLesson[],
): Course {
  const old = course.lessons ?? [];
  const seen = new Set<string>();
  for (const e of edits)
    for (const id of e.sourceIds) {
      if (!sources[id])
        throw new AppError(400, 'FONTE_DESCONHECIDA', 'Uma das fontes não existe mais.');
      if (seen.has(id))
        throw new AppError(400, 'FONTE_REPETIDA', 'A mesma fonte não pode estar em duas aulas.');
      seen.add(id);
    }
  const lessons = edits.map((e) => {
    const base = old.find((l) => l.id === e.id);
    if (!base) throw new AppError(400, 'AULA_DESCONHECIDA', 'Uma das aulas não existe mais.');
    const parts = old.filter((l) => l.sourceIds?.some((id) => e.sourceIds.includes(id)));
    const estimated = parts.some((l) => l.minutesEstimated);
    return {
      ...base,
      title: e.title.trim().slice(0, 200) || base.title,
      sourceIds: e.sourceIds,
      minutes: parts.reduce((n, l) => n + l.minutes, 0) || base.minutes,
      ...(estimated ? { minutesEstimated: true } : {}),
    };
  });
  return { ...course, lessons, minutes: lessons.reduce((n, l) => n + l.minutes, 0) };
}
