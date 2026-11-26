import { mastery, type Concept, type StudyMode, type Workspace } from '../domain';
import { exercisesOf } from '../exercises/migrate';
import { attemptKindOf, type Exercise, type ExerciseType } from '../exercises/schema';
import { AppError } from '../runtime/analysis';
import {
  ESTIMATE_MINUTES,
  MAX_ITEMS,
  PROVA_MAX_MINUTES,
  PROVA_MIN_MINUTES,
  RAPIDO_MAX_MINUTES,
} from './session';

export const MODE_FORMATS: Record<StudyMode, ExerciseType[]> = {
  rapido: ['escolha', 'ligar'],
  aprofundar: ['desenho', 'ligar', 'escrita'],
  // Prova e revisão seguem a ordem de preferência: escrita pesa mais na prova, escolha é a recuperação curta.
  prova: ['escrita', 'escolha'],
  revisao: ['escolha', 'escrita'],
};
const PREFER_ORDER: Record<StudyMode, boolean> = {
  rapido: false,
  aprofundar: false,
  prova: true,
  revisao: true,
};
const NO_EXERCISES: Record<StudyMode, string> = {
  rapido: 'Nenhum conceito tem exercício de escolha ou ligar para o modo Rápido.',
  aprofundar: 'Nenhum conceito tem exercício de desenho, ligar ou escrita para o modo Aprofundar.',
  prova: 'Os conceitos escolhidos não têm exercício de escolha ou escrita para a Prova.',
  revisao: 'Nenhum conceito vencido ou com erro recente tem exercício de escolha ou escrita.',
};

type Item = { conceptId: string; exerciseId: string };
const err = (status: number, code: string, message: string) => new AppError(status, code, message);

const rank = (c: Concept, now: number) =>
  c.attempts.at(-1)?.correct === false ? 0 : c.due > 0 && c.due <= now ? 1 : 2;

function compare(a: Concept, b: Concept, now: number, mode: StudyMode) {
  if (mode === 'aprofundar') {
    const diff = mastery(a).evidenceCount - mastery(b).evidenceCount;
    if (diff) return diff;
  }
  const ra = rank(a, now);
  const rb = rank(b, now);
  if (ra !== rb) return ra - rb;
  if (ra === 1 && a.due !== b.due) return a.due - b.due;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Tipos disponíveis do conceito para o modo, do preferido ao menos treinado. */
function pick(concept: Concept, mode: StudyMode): Exercise[] {
  const formats = MODE_FORMATS[mode];
  const all = exercisesOf(concept);
  const byType = formats
    .map((type) => ({ type, list: all.filter((e) => e.type === type) }))
    .filter((g) => g.list.length);
  const used = (type: ExerciseType) =>
    concept.attempts.filter((a) => a.kind === attemptKindOf(type)).length;
  const ordered = PREFER_ORDER[mode]
    ? byType
    : [...byType].sort(
        (a, b) => used(a.type) - used(b.type) || formats.indexOf(a.type) - formats.indexOf(b.type),
      );
  // Rotação: entre vários exercícios do mesmo tipo, o menos usado vem primeiro.
  return ordered.map((g) => g.list[used(g.type) % g.list.length]);
}

export function selectItems(
  ws: Workspace,
  args: { mode: StudyMode; conceptIds?: string[]; now: number },
): { items: Item[]; limitMinutes?: number } {
  const { mode, now } = args;
  const ids = args.conceptIds ? [...new Set(args.conceptIds)] : undefined;
  if (mode === 'prova' && (!ids || ids.length < 1 || ids.length > 10))
    throw err(400, 'PROVA_SEM_CONCEITOS', 'Escolha de 1 a 10 conceitos para a Prova.');
  let pool: Concept[];
  if (ids) {
    pool = ids.map((id) => {
      const c = ws.concepts.find((x) => x.id === id);
      if (!c) throw err(404, 'CONCEITO_INEXISTENTE', 'Conceito inexistente.');
      return c;
    });
  } else pool = ws.concepts.filter((c) => c.attempts.length > 0);
  if (mode === 'revisao') pool = pool.filter((c) => rank(c, now) < 2);
  const ordered = [...pool].sort((a, b) => compare(a, b, now, mode));

  const perConcept = mode === 'aprofundar' ? 2 : 1;
  const items: Item[] = [];
  const types: ExerciseType[] = [];
  let minutes = 0;
  outer: for (const c of ordered) {
    for (const e of pick(c, mode).slice(0, perConcept)) {
      if (items.length >= MAX_ITEMS[mode]) break outer;
      if (mode === 'rapido' && minutes + ESTIMATE_MINUTES[e.type] > RAPIDO_MAX_MINUTES) break outer;
      items.push({ conceptId: c.id, exerciseId: e.id });
      types.push(e.type);
      minutes += ESTIMATE_MINUTES[e.type];
    }
  }
  if (!items.length) throw err(409, 'SEM_EXERCICIOS', NO_EXERCISES[mode]);
  if (mode === 'prova')
    return {
      items,
      limitMinutes: Math.min(PROVA_MAX_MINUTES, Math.max(PROVA_MIN_MINUTES, minutes)),
    };
  return { items };
}
