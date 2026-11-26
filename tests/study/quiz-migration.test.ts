import { describe, expect, it } from 'vitest';
import { emptyWorkspace, workspaceSchema, type Concept, type Workspace } from '@/lib/study/domain';
import {
  applyQuizMigration,
  extractLegacyQuestions,
  isTestStage,
  planQuizMigration,
} from '@/lib/study/legacy/quiz-migration';

const q = (over: Record<string, unknown> = {}) => ({
  id: 'study:c1',
  type: 'single',
  answer: ['C'],
  points: 1,
  options: [
    { label: 'idade > 18', value: 'A' },
    { label: 'idade <= 18', value: 'B' },
    { label: 'idade < 18', value: 'C' },
    { label: 'idade == 18', value: 'D' },
  ],
  analysis: 'A negação deve cobrir os casos em que P é falsa.',
  question: 'Se P significa idade >= 18, qual condição representa ¬P?',
  hasAnswer: true,
  ...over,
});
const scene = (id: string, questions: unknown[], type = 'quiz') => ({
  id,
  data: { id, type, content: { type, questions } },
});
const stage = (id: string, name: string, scenes: ReturnType<typeof scene>[]) => ({
  id,
  name,
  scenes,
});
const concept = (id: string, label: string, over: Partial<Concept> = {}): Concept => ({
  id,
  label,
  summary: 'r',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [],
  due: 0,
  exercises: [],
  ...over,
});
const ws = (concepts: Concept[]): Workspace => ({ ...emptyWorkspace(), concepts });

describe('extração das perguntas antigas', () => {
  it('lê single e multiple e converte as respostas para índices nas opções', () => {
    const stages = [
      stage('s1', 'Lógica', [
        scene('sc1', [
          q(),
          q({ id: 'study:c2', type: 'multiple', answer: ['A', 'D'], question: 'Quais?' }),
        ]),
      ]),
    ];
    const out = extractLegacyQuestions(stages);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      stageId: 's1',
      sceneId: 'sc1',
      id: 'study:c1',
      type: 'single',
      answer: ['C'],
    });
    expect(out[1].type).toBe('multiple');
  });
  it('ignora cena que não é quiz, opções vazias, resposta fora das opções e mais de 6 opções', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      label: 'o' + i,
      value: String.fromCharCode(65 + i),
    }));
    const stages = [
      stage('s1', 'X', [
        scene('a', [q()], 'slide'),
        scene('b', [q({ options: [] })]),
        scene('c', [q({ answer: ['Z'] })]),
        scene('d', [q({ options: many, answer: ['A'] })]),
        scene('e', [q({ question: '' })]),
        scene('f', [q({ answer: [] })]),
      ]),
    ];
    expect(extractLegacyQuestions(stages)).toEqual([]);
  });
  it('não lança com dado estranho', () => {
    const weird: any[] = [
      {
        id: 's',
        name: 'n',
        scenes: [
          { id: 'x', data: null },
          { id: 'y', data: 'texto' },
          { id: 'z', data: { content: 5 } },
        ],
      },
      { id: 't', name: 'm', scenes: [] },
    ];
    expect(extractLegacyQuestions(weird)).toEqual([]);
  });
});

describe('isTestStage', () => {
  it('reconhece stages de teste e preserva as reais', () => {
    expect(isTestStage('TESTE SINTÉTICO · Revisão espaçada')).toBe(true);
    expect(isTestStage('Revisão · TESTE SINTÉTICO · Player nativo')).toBe(true);
    expect(isTestStage('TESTE · Estudos guiados 1793678164416')).toBe(true);
    expect(isTestStage('Lógica do CS50: das frases às condições')).toBe(false);
  });
});

describe('plano da migração', () => {
  const questions = (stages: ReturnType<typeof stage>[]) => extractLegacyQuestions(stages);
  it('uma pergunta study:<conceito> vira exercício do conceito', () => {
    const plan = planQuizMigration(
      ws([concept('c1', 'Negação')]),
      questions([stage('s1', 'Lógica', [scene('sc', [q()])])]),
    );
    expect(plan.matched).toHaveLength(1);
    expect(plan.matched[0]).toMatchObject({ conceptId: 'c1' });
    expect(plan.matched[0].exercise).toMatchObject({
      type: 'escolha',
      id: 'legacy:s1:sc:0',
      answerIndexes: [2],
      options: ['idade > 18', 'idade <= 18', 'idade < 18', 'idade == 18'],
      explanation: expect.stringContaining('negação'),
    });
    expect(plan.imported).toEqual([]);
  });
  it('a mesma pergunta que o conceito já tem (acentos e caixa diferentes) é duplicada', () => {
    const existing = concept('c1', 'Negação', {
      question: {
        question: 'SE p significa idade >= 18, qual condição representa ¬P?',
        options: ['a', 'b', 'c', 'd'],
        answerIndex: 0,
        explanation: '',
      },
    });
    const plan = planQuizMigration(
      ws([existing]),
      questions([
        stage('s1', 'Lógica', [
          scene('sc', [
            q({ question: 'Se P significa idade >= 18, qual condição representa ¬p?' }),
          ]),
        ]),
      ]),
    );
    expect(plan.matched).toEqual([]);
    expect(plan.skipped[0].reason).toBe('duplicada');
  });
  it('a mesma pergunta repetida em duas stages só entra uma vez', () => {
    const plan = planQuizMigration(
      ws([concept('c1', 'Negação')]),
      questions([
        stage('s1', 'Lógica', [scene('a', [q()])]),
        stage('s2', 'Revisão · Lógica', [scene('b', [q()])]),
      ]),
    );
    expect(plan.matched).toHaveLength(1);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['duplicada']);
  });
  it('pergunta sem conceito vira conceito Importado por stage', () => {
    const plan = planQuizMigration(
      ws([]),
      questions([
        stage('s9', 'Conversores catalíticos', [scene('sc', [q({ id: 'outra-coisa' })])]),
      ]),
    );
    expect(plan.imported).toHaveLength(1);
    expect(plan.imported[0]).toMatchObject({
      conceptId: 'legacy:s9',
      conceptLabel: 'Importado · Conversores catalíticos',
    });
  });
  it('stage de teste é pulada', () => {
    const plan = planQuizMigration(
      ws([concept('c1', 'N')]),
      questions([stage('s1', 'TESTE SINTÉTICO · X', [scene('sc', [q()])])]),
    );
    expect(plan.matched).toEqual([]);
    expect(plan.skipped[0].reason).toBe('teste');
  });
  it('passar de 30 exercícios no conceito vai para o relatório, não é descartado em silêncio', () => {
    const many = Array.from({ length: 31 }, (_, i) => q({ question: 'Pergunta ' + i }));
    const plan = planQuizMigration(
      ws([concept('c1', 'N')]),
      questions([stage('s1', 'Lógica', [scene('sc', many)])]),
    );
    expect(plan.matched).toHaveLength(30);
    expect(plan.skipped.filter((s) => s.reason === 'limite')).toHaveLength(1);
  });
});

describe('aplicação da migração', () => {
  const stages = [
    stage('s1', 'Lógica', [
      scene('sc', [q(), q({ id: 'study:c2', question: 'Outra pergunta?', answer: ['A'] })]),
    ]),
    stage('s2', 'Solta', [scene('sd', [q({ id: 'sem-conceito', question: 'Pergunta solta?' })])]),
  ];
  const base = ws([
    concept('c1', 'Negação', {
      question: {
        question: 'Pergunta antiga do conceito?',
        options: ['a', 'b', 'c', 'd'],
        answerIndex: 1,
        explanation: 'x',
      },
    }),
  ]);
  it('aplica, mantém o question antigo e passa no workspaceSchema', () => {
    const plan = planQuizMigration(base, extractLegacyQuestions(stages));
    const out = applyQuizMigration(base, plan);
    expect(() => workspaceSchema.parse(out)).not.toThrow();
    const c1 = out.concepts.find((c) => c.id === 'c1')!;
    expect(c1.question?.question).toBe('Pergunta antiga do conceito?');
    expect(c1.exercises.some((e) => e.id === 'legacy:s1:sc:0')).toBe(true);
    const imported = out.concepts.find((c) => c.id === 'legacy:s2')!;
    expect(imported).toMatchObject({ label: 'Importado · Solta', origin: 'manual' });
    expect(imported.exercises).toHaveLength(1);
  });
  it('é idempotente', () => {
    const plan = planQuizMigration(base, extractLegacyQuestions(stages));
    const once = applyQuizMigration(base, plan);
    const twice = applyQuizMigration(once, plan);
    expect(twice).toEqual(once);
    const replanned = planQuizMigration(once, extractLegacyQuestions(stages));
    expect(replanned.matched).toEqual([]);
    expect(replanned.imported).toEqual([]);
    expect(applyQuizMigration(once, replanned)).toEqual(once);
  });
});
