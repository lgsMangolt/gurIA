import { describe, expect, it } from 'vitest';
import { emptyWorkspace, type Concept, type Workspace } from '@/lib/study/domain';
import { buildApostila } from '@/lib/study/courses/apostila';

const concept = (
  id: string,
  courseIds: string[],
  exercises: Concept['exercises'] = [],
): Concept => ({
  id,
  label: `Conceito ${id}`,
  summary: `Resumo ${id}`,
  note: `Nota ${id}`,
  origin: 'lesson',
  courseIds,
  evidence: [],
  attempts: [],
  exercises,
  due: 0,
});
const state = (): Workspace => ({
  ...emptyWorkspace(),
  courses: [
    {
      id: 'c1',
      title: 'Chinês I',
      url: '',
      minutes: 20,
      practiceMinutes: 0,
      reviewMinutes: 0,
      completedMinutes: 0,
      deadline: null,
      hoursSource: 'estimate',
      sourceNote: '',
      origin: 'ocw',
      license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      lessons: [
        {
          id: 'L1',
          title: 'Aula 1',
          minutes: 10,
          status: 'processada',
          summary: 'Resumo da aula 1',
        },
        { id: 'L2', title: 'Aula 2', minutes: 10, status: 'importada' },
      ],
    },
  ],
  concepts: [
    concept(
      'L1:a',
      ['c1'],
      [
        {
          type: 'escolha',
          id: 'L1:a:ex1',
          prompt: 'O que é 汉字?',
          options: ['números', 'caracteres chineses'],
          answerIndexes: [1],
          explanation: '',
        },
        {
          type: 'ligar',
          id: 'L1:a:ex2',
          prompt: 'Ligue',
          pairs: [
            { left: '你好', right: 'olá' },
            { left: '谢谢', right: 'obrigado' },
          ],
        },
      ],
    ),
    concept('L1:outro-curso', ['c2']),
    concept('manual', ['c1']),
  ],
});

describe('buildApostila', () => {
  it('aula não processada aparece como pendente no sumário', () => {
    const a = buildApostila(state(), 'c1');
    expect(a.lessons.map((l) => [l.title, l.pending])).toEqual([
      ['Aula 1', false],
      ['Aula 2', true],
    ]);
    expect(a.lessons[0].summary).toBe('Resumo da aula 1');
  });

  it('só conceitos do curso entram', () => {
    const a = buildApostila(state(), 'c1');
    expect(a.lessons[0].concepts.map((c) => c.label)).toEqual(['Conceito L1:a']);
    expect(JSON.stringify(a)).not.toContain('outro-curso');
  });

  it('gabarito de escolha mostra a alternativa certa e de ligar mostra os pares', () => {
    const a = buildApostila(state(), 'c1');
    expect(a.lessons[0].exercises).toHaveLength(2);
    expect(a.answers).toEqual([
      {
        lessonTitle: 'Aula 1',
        items: ['1. caracteres chineses', '2. 你好 → olá; 谢谢 → obrigado'],
      },
    ]);
  });

  it('licença aparece na capa quando existe', () => {
    const a = buildApostila(state(), 'c1');
    expect(a).toMatchObject({
      title: 'Chinês I',
      origin: 'ocw',
      license: expect.stringContaining('by-nc-sa'),
    });
  });
});
