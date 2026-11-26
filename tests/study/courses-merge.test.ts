import { describe, expect, it } from 'vitest';
import { mergeImport } from '@/lib/study/courses/merge';
import type { DraftLesson, ImportDraft, ImportSource } from '@/lib/study/courses/types';

const source = (id: string, fingerprint = `fp-${id}`): ImportSource => ({
  id,
  kind: 'legenda',
  path: `${id}.srt`,
  title: id,
  fingerprint,
});
const lesson = (
  title: string,
  sources: ImportSource[],
  minutes: number | null = 10,
): DraftLesson => ({
  title,
  sources,
  minutes,
});
const draft = (lessons: DraftLesson[]): ImportDraft => ({
  title: 'Curso de teste',
  origin: 'pasta',
  license: 'CC BY',
  importSource: 'C:/cursos/teste',
  lessons,
  ignored: [],
});

describe('mergeImport', () => {
  it("cria curso novo com aulas na ordem do rascunho, status 'importada' e sourceIds", () => {
    const { course, sources, added } = mergeImport(
      null,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 2', [source('b')])]),
      {},
    );
    expect(course.title).toBe('Curso de teste');
    expect(course.origin).toBe('pasta');
    expect(course.license).toBe('CC BY');
    expect(course.importSource).toBe('C:/cursos/teste');
    expect(course.lessons!.map((l) => l.title)).toEqual(['Aula 1', 'Aula 2']);
    expect(course.lessons!.every((l) => l.status === 'importada')).toBe(true);
    const [first] = course.lessons!;
    expect(first.sourceIds).toHaveLength(1);
    expect(sources[first.sourceIds![0]].fingerprint).toBe('fp-a');
    expect(added).toBe(2);
    expect(course.minutes).toBe(20);
  });

  it('reimportar a mesma fonte não duplica aulas e mantém título editado, ordem e status', () => {
    const first = mergeImport(
      null,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 2', [source('b')])]),
      {},
    );
    const [one, two] = first.course.lessons!;
    const edited = {
      ...first.course,
      lessons: [
        { ...two, title: 'Minha aula 2', status: 'processada' as const, summary: 'ok' },
        one,
      ],
    };
    const again = mergeImport(
      edited,
      draft([lesson('Aula 1', [source('x', 'fp-a')]), lesson('Aula 2', [source('y', 'fp-b')])]),
      first.sources,
    );
    expect(again.course.id).toBe(first.course.id);
    expect(again.course.lessons!.map((l) => [l.title, l.status])).toEqual([
      ['Minha aula 2', 'processada'],
      ['Aula 1', 'importada'],
    ]);
    expect(again.added).toBe(0);
    expect(again.missing).toBe(0);
  });

  it('aula juntada (sourceIds de duas fontes) continua uma aula só', () => {
    const first = mergeImport(
      null,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 2', [source('b')])]),
      {},
    );
    const [one, two] = first.course.lessons!;
    const joined = {
      ...first.course,
      lessons: [
        { ...one, title: 'Aulas 1 e 2', sourceIds: [...one.sourceIds!, ...two.sourceIds!] },
      ],
    };
    const again = mergeImport(
      joined,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 2', [source('b')])]),
      first.sources,
    );
    expect(again.course.lessons!.map((l) => l.title)).toEqual(['Aulas 1 e 2']);
    expect(again.added).toBe(0);
  });

  it("fonte nova vai para o fim com status 'importada'; fonte sumida marca 'fonte-ausente' sem apagar resumo", () => {
    const first = mergeImport(
      null,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 2', [source('b')])]),
      {},
    );
    const withSummary = {
      ...first.course,
      lessons: first.course.lessons!.map((l, i) =>
        i === 1 ? { ...l, status: 'processada' as const, summary: 'resumo guardado' } : l,
      ),
    };
    const again = mergeImport(
      withSummary,
      draft([lesson('Aula 1', [source('a')]), lesson('Aula 3', [source('c')])]),
      first.sources,
    );
    expect(again.course.lessons!.map((l) => [l.title, l.status])).toEqual([
      ['Aula 1', 'importada'],
      ['Aula 2', 'fonte-ausente'],
      ['Aula 3', 'importada'],
    ]);
    expect(again.course.lessons![1].summary).toBe('resumo guardado');
    expect(again.added).toBe(1);
    expect(again.missing).toBe(1);
  });

  it('duração nula vira estimativa: minutes = max(5, round(palavras/150)) e minutesEstimated = true', () => {
    const { course } = mergeImport(
      null,
      draft([
        { ...lesson('Curta', [source('a')], null), words: 300 },
        { ...lesson('Longa', [source('b')], null), words: 3000 },
        lesson('Medida', [source('c')], 12),
      ]),
      {},
    );
    expect(course.lessons!.map((l) => [l.minutes, l.minutesEstimated ?? false])).toEqual([
      [5, true],
      [20, true],
      [12, false],
    ]);
    expect(course.hoursSource).toBe('estimate');
  });

  it('o status inicial vindo do leitor é respeitado', () => {
    const { course } = mergeImport(
      null,
      draft([{ ...lesson('Sem legenda', [source('a')]), status: 'sem-texto' }]),
      {},
    );
    expect(course.lessons![0].status).toBe('sem-texto');
  });

  it('fonte nova numa aula já conhecida entra nessa aula (revisão final I2)', () => {
    const first = mergeImport(null, draft([lesson('01 Intro', [source('a')])]), {});
    const again = mergeImport(
      first.course,
      draft([lesson('01 Intro', [source('a'), { ...source('pdf'), kind: 'documento' }])]),
      first.sources,
    );
    expect(again.course.lessons).toHaveLength(1);
    const ids = again.course.lessons![0].sourceIds!;
    expect(ids.map((id) => again.sources[id].fingerprint).sort()).toEqual(['fp-a', 'fp-pdf']);
    expect(again.added).toBe(0);
  });

  it('aula removida do roteiro não volta ao reimportar (revisão final I3)', () => {
    const first = mergeImport(
      null,
      draft([lesson('1', [source('a')]), lesson('2', [source('b')])]),
      {},
    );
    const [one, two] = first.course.lessons!;
    const removed = { ...first.course, lessons: [one] };
    const again = mergeImport(
      removed,
      draft([lesson('1', [source('a')]), lesson('2', [source('b')])]),
      first.sources,
      two.sourceIds,
    );
    expect(again.course.lessons!.map((l) => l.title)).toEqual(['1']);
    expect(again.added).toBe(0);
  });
});
