import { expect, it } from 'vitest';
import { buildStudy, intakeSchema, studyPlanSchema, studyPrompt } from '@/lib/study/intake';
import { emptyWorkspace, mastery, validateReferences } from '@/lib/study/domain';
const intake = intakeSchema.parse({
  topic: 'Lógica',
  goal: 'Aprender condicionais',
  level: 'beginner',
  format: 'mixed',
  minutes: 30,
  answers: [{ question: 'Onde aplicar?', answer: 'Programação' }],
});
const section = (title: string) => ({
  title,
  explanation: 'Uma condição testa se uma proposição é verdadeira.',
  example: 'Se chover, levar guarda-chuva.',
  practice: 'Escreva uma condição sobre estudo.',
  question: {
    question: 'Qual é uma condição?',
    options: ['Se chover, sair', 'Sempre', 'Nunca', 'Talvez'],
    answerIndex: 0,
    explanation: 'A primeira contém condição e consequência.',
  },
});
const plan = studyPlanSchema.parse({
  title: 'Lógica',
  objective: 'Aplicar condicionais',
  connections: [{ source: 0, target: 1, relation: 'Combina' }],
  sections: [section('Condições'), section('Operadores')],
});
it('builds a free learning with linked concepts, questions and estimated workload without claiming mastery', () => {
  let counter = 0;
  const state = emptyWorkspace();
  const r = buildStudy(state, intake, plan, () => String(++counter));
  expect(r.course.learningType).toBe('free');
  expect(r.course.stageId).toBeUndefined(); // sem aula do player antigo
  expect(r.course.minutes! + r.course.practiceMinutes + r.course.reviewMinutes).toBe(30);
  expect(r.course.lessons!.reduce((n, l) => n + l.minutes, 0)).toBeCloseTo(r.course.minutes!);
  expect(r.data.connections[0]).toMatchObject({
    source: r.nodes[0].id,
    target: r.nodes[1].id,
    relation: 'Combina',
  });
  expect(
    r.nodes.every(
      (n) => n.origin === 'ai' && n.evidence.length === 0 && !mastery(n).mastered && n.question,
    ),
  ).toBe(true);
  expect(() => validateReferences(r.data)).not.toThrow();
  expect(state.courses).toHaveLength(0);
});
it('falls back to learning order instead of writing dangling diagram edges', () => {
  let counter = 0;
  const r = buildStudy(
    emptyWorkspace(),
    intake,
    { ...plan, connections: [{ source: 4, target: 0, relation: 'Inválida' }] },
    () => String(++counter),
  );
  expect(r.data.connections).toHaveLength(1);
  expect(r.data.connections[0].relation).toBe('Próxima parte do estudo');
  expect(() => validateReferences(r.data)).not.toThrow();
});
it('passes learner answers into preparation and rejects invalid session time', () => {
  expect(studyPrompt(intake)).toContain('Programação');
  expect(intakeSchema.safeParse({ ...intake, minutes: 0 }).success).toBe(false);
});
