import { describe, expect, it } from 'vitest';
import { emptyWorkspace, workspaceSchema, type Concept } from '@/lib/study/domain';
import {
  attemptKindOf,
  desenhoSchema,
  escolhaSchema,
  escritaSchema,
  exerciseSchema,
  ligarSchema,
} from '@/lib/study/exercises/schema';
import { exercisesOf, materializeExercises } from '@/lib/study/exercises/migrate';
import { buildDemoWorkspace } from '../../scripts/readme-demo/fixture';

const escolha = {
  type: 'escolha' as const,
  id: 'e1',
  prompt: 'Qual é a capital?',
  options: ['A', 'B', 'C'],
  answerIndexes: [1],
  explanation: '',
};
const rubric = [
  { criterion: 'Cita a definição', weight: 1 },
  { criterion: 'Dá um exemplo', weight: 1 },
];
const concept = (extra: Partial<Concept> = {}): Concept =>
  ({
    id: 'c1',
    label: 'Conceito',
    summary: '',
    note: '',
    origin: 'manual',
    courseIds: [],
    evidence: [],
    attempts: [],
    due: 0,
    exercises: [],
    ...extra,
  }) as Concept;
const question = {
  question: 'Pergunta antiga?',
  options: ['a', 'b', 'c', 'd'],
  answerIndex: 2,
  explanation: 'porque sim',
};

describe('schemas dos exercícios', () => {
  it('escolha válida passa e índice de resposta fora das opções é recusado', () => {
    expect(escolhaSchema.parse(escolha).answerIndexes).toEqual([1]);
    expect(() => escolhaSchema.parse({ ...escolha, answerIndexes: [3] })).toThrow();
    expect(() => escolhaSchema.parse({ ...escolha, answerIndexes: [1, 1] })).toThrow();
    expect(() => escolhaSchema.parse({ ...escolha, answerIndexes: [] })).toThrow();
  });
  it('escolha com menos de 2 opções é recusada', () => {
    expect(() => escolhaSchema.parse({ ...escolha, options: ['A'], answerIndexes: [0] })).toThrow();
  });
  it('ligar com lado esquerdo repetido é recusado', () => {
    const ok = {
      type: 'ligar',
      id: 'l1',
      prompt: 'Ligue',
      pairs: [
        { left: 'a', right: '1' },
        { left: 'b', right: '2' },
      ],
    };
    expect(ligarSchema.parse(ok).pairs).toHaveLength(2);
    expect(() =>
      ligarSchema.parse({
        ...ok,
        pairs: [
          { left: 'a', right: '1' },
          { left: 'a', right: '2' },
        ],
      }),
    ).toThrow();
    expect(() =>
      ligarSchema.parse({
        ...ok,
        pairs: [
          { left: 'a', right: '1' },
          { left: 'b', right: '1' },
        ],
      }),
    ).toThrow();
  });
  it('desenho e escrita exigem de 2 a 6 itens de rubrica', () => {
    const d = { type: 'desenho', id: 'd1', prompt: 'Desenhe', rubric };
    const w = { type: 'escrita', id: 'w1', prompt: 'Explique', rubric };
    expect(desenhoSchema.parse(d).rubric).toHaveLength(2);
    expect(escritaSchema.parse(w).minChars).toBe(0);
    expect(() => desenhoSchema.parse({ ...d, rubric: rubric.slice(0, 1) })).toThrow();
    expect(() => escritaSchema.parse({ ...w, rubric: Array(7).fill(rubric[0]) })).toThrow();
    expect(exerciseSchema.parse(w).type).toBe('escrita');
  });
  it('attemptKindOf mapeia os quatro tipos', () => {
    expect(attemptKindOf('escolha')).toBe('choice');
    expect(attemptKindOf('ligar')).toBe('connect');
    expect(attemptKindOf('desenho')).toBe('draw');
    expect(attemptKindOf('escrita')).toBe('write');
  });
});

describe('migração das perguntas antigas', () => {
  it('exercisesOf deriva um escolha da pergunta antiga', () => {
    const [ex] = exercisesOf(concept({ question }));
    expect(ex).toMatchObject({
      type: 'escolha',
      id: 'escolha:c1',
      prompt: 'Pergunta antiga?',
      options: ['a', 'b', 'c', 'd'],
      answerIndexes: [2],
      explanation: 'porque sim',
    });
  });
  it('exercisesOf devolve [] sem pergunta nem exercícios', () => {
    expect(exercisesOf(concept())).toEqual([]);
  });
  it('exercisesOf prefere os exercícios do conceito', () => {
    const exercises = [escolhaSchema.parse(escolha)];
    expect(exercisesOf(concept({ question, exercises }))).toEqual(exercises);
  });
  it('materializeExercises é idempotente e mantém a pergunta antiga', () => {
    const ws = { ...emptyWorkspace(), concepts: [concept({ question })] };
    const once = materializeExercises(ws);
    const twice = materializeExercises(once);
    expect(twice).toEqual(once);
    expect(once.concepts[0].question).toEqual(question);
    expect(once.concepts[0].exercises).toHaveLength(1);
  });
  it('conceito antigo sem o campo exercises continua válido', () => {
    const demo = buildDemoWorkspace();
    const legacy = {
      ...demo,
      concepts: demo.concepts.map(({ exercises: _removed, ...rest }) => rest),
    };
    const parsed = workspaceSchema.parse(legacy);
    expect(parsed.concepts.length).toBeGreaterThan(0);
    for (const c of parsed.concepts) expect(c.exercises).toEqual([]);
  });
  it('perguntas antigas que o novo schema recusaria não geram exercício inválido', () => {
    const bad = [
      concept({ question: { ...question, question: '' } }),
      concept({ question: { ...question, options: ['a', '', 'c', 'd'] } }),
      concept({ question: { ...question, explanation: 'x'.repeat(5000) } }),
      concept({ id: 'i'.repeat(115), question }),
    ];
    for (const c of bad) {
      expect(exercisesOf(c)).toEqual([]);
      const ws = materializeExercises({ ...emptyWorkspace(), concepts: [c] });
      expect(() => workspaceSchema.parse(ws)).not.toThrow();
    }
  });
});
