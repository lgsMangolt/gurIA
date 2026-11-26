import type { Concept, Workspace } from '../domain';
import { exercisesOf, materializeExercises } from '../exercises/migrate';
import { escolhaSchema, type Exercise } from '../exercises/schema';

export type LegacyQuestion = {
  stageId: string;
  stageName: string;
  sceneId: string;
  /** Posição da pergunta dentro da cena (compõe o id estável do exercício). */
  index: number;
  id: string;
  type: 'single' | 'multiple';
  question: string;
  options: { value: string; label: string }[];
  answer: string[];
  analysis?: string;
};
export type PlanItem = {
  conceptId: string;
  conceptLabel?: string;
  exercise: Exercise;
  question: LegacyQuestion;
};
export type SkipReason = 'teste' | 'invalida' | 'duplicada' | 'limite';
export type QuizPlan = {
  matched: PlanItem[];
  imported: PlanItem[];
  skipped: { question: LegacyQuestion; reason: SkipReason }[];
};

const MAX_EXERCISES = 30;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** Lê só as cenas `quiz` das stages do OpenMAIC. Nunca lança por dado estranho. */
export function extractLegacyQuestions(
  stages: { id: string; name: string; scenes: { id: string; data: unknown }[] }[],
): LegacyQuestion[] {
  const out: LegacyQuestion[] = [];
  for (const stage of stages) {
    for (const scene of stage.scenes ?? []) {
      const data = scene.data;
      if (!isObject(data) || data.type !== 'quiz' || !isObject(data.content)) continue;
      const list = data.content.questions;
      if (!Array.isArray(list)) continue;
      list.forEach((raw, index) => {
        if (!isObject(raw)) return;
        const type = raw.type === 'single' || raw.type === 'multiple' ? raw.type : null;
        const question = typeof raw.question === 'string' ? raw.question.trim() : '';
        const options = Array.isArray(raw.options)
          ? raw.options.filter(
              (o): o is { value: string; label: string } =>
                isObject(o) && typeof o.value === 'string' && typeof o.label === 'string',
            )
          : [];
        const answer = Array.isArray(raw.answer)
          ? raw.answer.filter((a): a is string => typeof a === 'string')
          : [];
        if (!type || !question || options.length < 2 || options.length > 6) return;
        if (!answer.length || answer.some((a) => !options.some((o) => o.value === a))) return;
        out.push({
          stageId: stage.id,
          stageName: stage.name,
          sceneId: scene.id,
          index,
          id: typeof raw.id === 'string' ? raw.id : '',
          type,
          question,
          options: options.map((o) => ({ value: o.value, label: o.label })),
          answer,
          analysis: typeof raw.analysis === 'string' ? raw.analysis : undefined,
        });
      });
    }
  }
  return out;
}

export const isTestStage = (name: string): boolean =>
  /^\s*TESTE\b/i.test(name) || /TESTE SINTÉTICO/i.test(name);

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function toExercise(q: LegacyQuestion): Exercise | null {
  const parsed = escolhaSchema.safeParse({
    type: 'escolha',
    id: `legacy:${q.stageId}:${q.sceneId}:${q.index}`,
    prompt: q.question,
    options: q.options.map((o) => o.label),
    answerIndexes: q.answer.map((a) => q.options.findIndex((o) => o.value === a)),
    explanation: q.analysis ?? '',
  });
  return parsed.success ? parsed.data : null;
}

export function planQuizMigration(ws: Workspace, questions: LegacyQuestion[]): QuizPlan {
  const plan: QuizPlan = { matched: [], imported: [], skipped: [] };
  const known = new Map<string, { prompts: Set<string>; count: number }>();
  const target = (conceptId: string) => {
    let entry = known.get(conceptId);
    if (!entry) {
      const c = ws.concepts.find((x) => x.id === conceptId);
      const prompts = new Set<string>();
      let count = 0;
      if (c) {
        for (const e of exercisesOf(c)) if (e.type === 'escolha') prompts.add(norm(e.prompt));
        if (c.question) prompts.add(norm(c.question.question));
        count = c.exercises.length;
      }
      entry = { prompts, count };
      known.set(conceptId, entry);
    }
    return entry;
  };
  for (const q of questions) {
    if (isTestStage(q.stageName)) {
      plan.skipped.push({ question: q, reason: 'teste' });
      continue;
    }
    const exercise = toExercise(q);
    if (!exercise) {
      plan.skipped.push({ question: q, reason: 'invalida' });
      continue;
    }
    const studyId = q.id.startsWith('study:') ? q.id.slice('study:'.length) : '';
    const real = studyId && ws.concepts.some((c) => c.id === studyId) ? studyId : null;
    const conceptId = real ?? `legacy:${q.stageId}`;
    const entry = target(conceptId);
    if (exercise.type === 'escolha' && entry.prompts.has(norm(exercise.prompt))) {
      plan.skipped.push({ question: q, reason: 'duplicada' });
      continue;
    }
    if (entry.count >= MAX_EXERCISES) {
      plan.skipped.push({ question: q, reason: 'limite' });
      continue;
    }
    if (exercise.type === 'escolha') entry.prompts.add(norm(exercise.prompt));
    entry.count++;
    if (real) plan.matched.push({ conceptId, exercise, question: q });
    else
      plan.imported.push({
        conceptId,
        conceptLabel: `Importado · ${q.stageName}`,
        exercise,
        question: q,
      });
  }
  return plan;
}

export function applyQuizMigration(ws: Workspace, plan: QuizPlan): Workspace {
  let concepts = [...ws.concepts];
  for (const item of [...plan.matched, ...plan.imported]) {
    let index = concepts.findIndex((c) => c.id === item.conceptId);
    if (index === -1) {
      const created: Concept = {
        id: item.conceptId,
        label: (item.conceptLabel ?? item.conceptId).slice(0, 160),
        summary: 'Perguntas importadas dos quizzes antigos do OpenMAIC.',
        note: '',
        courseIds: [],
        origin: 'manual',
        evidence: [],
        attempts: [],
        exercises: [],
        due: 0,
      };
      concepts = [...concepts, created];
      index = concepts.length - 1;
    }
    const concept = concepts[index];
    if (concept.exercises.some((e) => e.id === item.exercise.id)) continue;
    if (concept.exercises.length >= MAX_EXERCISES) continue;
    concepts[index] = { ...concept, exercises: [...concept.exercises, item.exercise] };
  }
  return materializeExercises({ ...ws, concepts });
}
