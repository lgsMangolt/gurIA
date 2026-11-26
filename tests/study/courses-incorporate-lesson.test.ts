import { describe, expect, it } from 'vitest';
import { emptyWorkspace, type Workspace } from '@/lib/study/domain';
import { incorporateLesson } from '@/lib/study/courses/incorporate-lesson';
import type { LessonResult } from '@/lib/study/courses/lesson-analysis';

const state = (): Workspace => ({
  ...emptyWorkspace(),
  courses: [
    {
      id: 'c1',
      title: 'Curso',
      url: '',
      minutes: 10,
      practiceMinutes: 0,
      reviewMinutes: 0,
      completedMinutes: 0,
      deadline: null,
      hoursSource: 'estimate',
      sourceNote: '',
      origin: 'pasta',
      lessons: [
        { id: 'L1', title: 'Aula', minutes: 10, status: 'aguardando-revisao', sourceIds: ['s'] },
      ],
    },
  ],
});
const concept = (id: string, label: string) => ({
  id: `L1:${id}`,
  label,
  summary: `Resumo ${label}`,
  note: 'Nota',
  originalTerms: ['汉字'],
  evidence: 'trecho',
  startSeconds: 5,
  endSeconds: 9,
  exercises: [
    {
      type: 'escolha' as const,
      id: `L1:${id}:ex1`,
      prompt: 'P?',
      options: ['a', 'b'],
      answerIndexes: [0],
      explanation: '',
    },
  ],
});
const result: LessonResult = {
  summary: 'Resumo da aula',
  concepts: [concept('a', 'Alfa'), concept('b', 'Beta')],
  connections: [{ source: 'L1:a', target: 'L1:b', relationship: 'depende de' }],
};

describe('incorporateLesson', () => {
  it('só leva os aprovados, sem domínio (attempts vazio, due 0)', () => {
    const next = incorporateLesson(state(), 'c1', 'L1', result, ['L1:a']);
    expect(next.concepts.map((c) => c.label)).toEqual(['Alfa']);
    const [a] = next.concepts;
    expect(a).toMatchObject({ origin: 'lesson', courseIds: ['c1'], attempts: [], due: 0 });
    expect(a.exercises).toHaveLength(1);
    expect(a.note).toContain('汉字');
    expect(a.evidence[0]).toMatchObject({ text: 'trecho', start: 5, end: 9, courseId: 'c1' });
    const lesson = next.courses[0].lessons![0];
    expect(lesson).toMatchObject({ status: 'processada', summary: 'Resumo da aula' });
  });

  it('conexão com conceito não aprovado é descartada', () => {
    expect(incorporateLesson(state(), 'c1', 'L1', result, ['L1:a']).connections).toEqual([]);
    const both = incorporateLesson(state(), 'c1', 'L1', result, ['L1:a', 'L1:b']);
    expect(both.connections).toEqual([
      expect.objectContaining({ source: 'L1:a', target: 'L1:b', relation: 'depende de' }),
    ]);
  });

  it('aprovar de novo não duplica conceitos', () => {
    const once = incorporateLesson(state(), 'c1', 'L1', result, ['L1:a', 'L1:b']);
    const twice = incorporateLesson(once, 'c1', 'L1', result, ['L1:a', 'L1:b']);
    expect(twice.concepts).toHaveLength(2);
    expect(twice.connections).toHaveLength(1);
  });
});
