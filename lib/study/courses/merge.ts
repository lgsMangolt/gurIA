// Funde o rascunho de uma importação no curso existente, pela impressão digital
// de cada fonte: reimportar mantém nomes, ordem, junções, estados e resumos.
import { randomUUID } from 'node:crypto';
import type { Course } from '../domain';
import type { DraftLesson, ImportDraft, ImportSource, Lesson } from './types';

/** Minutos estimados pelo texto: leitura de ~150 palavras por minuto, mínimo de 5. */
export function estimateMinutes(words = 0): number {
  return Math.max(5, Math.round(words / 150));
}

function lessonMinutes(draft: DraftLesson): Pick<Lesson, 'minutes' | 'minutesEstimated'> {
  return draft.minutes && draft.minutes > 0
    ? { minutes: draft.minutes }
    : { minutes: estimateMinutes(draft.words), minutesEstimated: true };
}

export function mergeImport(
  course: Course | null,
  draft: ImportDraft,
  sourcesById: Record<string, ImportSource>,
  /** Fontes cujas aulas o dono removeu do roteiro: não voltam ao reimportar. */
  removedSourceIds: string[] = [],
): { course: Course; sources: Record<string, ImportSource>; added: number; missing: number } {
  const sources: Record<string, ImportSource> = { ...sourcesById };
  const idByFingerprint = new Map(Object.values(sourcesById).map((s) => [s.fingerprint, s.id]));
  const seen = new Set<string>();
  const fresh: Lesson[] = [];
  const extra = new Map<string, string[]>();

  for (const item of draft.lessons) {
    const ids = item.sources.map((s) => {
      const id = idByFingerprint.get(s.fingerprint) ?? randomUUID();
      sources[id] = { ...s, id };
      idByFingerprint.set(s.fingerprint, id);
      seen.add(id);
      return id;
    });
    if (ids.every((id) => removedSourceIds.includes(id))) continue;
    const known = (course?.lessons ?? []).find((l) => l.sourceIds?.some((id) => ids.includes(id)));
    // Fonte nova numa aula já conhecida (ex.: PDF acrescentado) entra nessa aula.
    if (known)
      extra.set(known.id, [
        ...(extra.get(known.id) ?? []),
        ...ids.filter((id) => !known.sourceIds!.includes(id) && !removedSourceIds.includes(id)),
      ]);
    else
      fresh.push({
        id: randomUUID(),
        title: item.title.slice(0, 200) || 'Aula',
        ...lessonMinutes(item),
        status: item.status ?? 'importada',
        sourceIds: ids,
      });
  }

  let missing = 0;
  const kept = (course?.lessons ?? []).map((original) => {
    const added = extra.get(original.id) ?? [];
    const l = added.length
      ? { ...original, sourceIds: [...new Set([...(original.sourceIds ?? []), ...added])] }
      : original;
    if (!l.sourceIds?.length) return l;
    const present = l.sourceIds.some((id) => seen.has(id));
    if (!present) {
      missing++;
      return { ...l, status: 'fonte-ausente' as const };
    }
    if (l.status === 'fonte-ausente')
      return { ...l, status: l.summary ? ('processada' as const) : ('importada' as const) };
    return l;
  });

  const lessons = [...kept, ...fresh];
  const base: Course = course ?? {
    id: randomUUID(),
    title: draft.title.slice(0, 200) || 'Curso importado',
    url: '',
    minutes: null,
    practiceMinutes: 0,
    reviewMinutes: 0,
    completedMinutes: 0,
    deadline: null,
    hoursSource: 'estimate',
    learningType: 'course',
    sourceNote: '',
  };
  return {
    course: {
      ...base,
      origin: draft.origin,
      license: draft.license ?? base.license,
      importSource: draft.importSource,
      lessons,
      minutes: lessons.reduce((n, l) => n + l.minutes, 0),
      hoursSource: lessons.some((l) => l.minutesEstimated) ? 'estimate' : 'measured',
    },
    sources,
    added: fresh.length,
    missing,
  };
}
