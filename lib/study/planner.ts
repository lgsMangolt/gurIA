import type { Course, StudyMode, Workspace } from './domain';
import { exercisesOf } from './exercises/migrate';

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Kind = 'lesson' | 'practice' | 'review';
export type PlanItem = {
  id: string;
  taskId: string;
  courseId: string;
  title: string;
  kind: Kind;
  minutes: number;
  workMinutes: number;
  reason: string;
  suggestedMode?: StudyMode;
};
type Task = {
  order?: number;
  id: string;
  courseId: string;
  title: string;
  kind: Kind;
  remaining: number;
  due?: string;
  deadline?: string;
  priority: number;
  reason: string;
};
const SUGGESTED_MODE: Partial<Record<Kind, StudyMode>> = {
  review: 'revisao',
  practice: 'aprofundar',
};
const round = (n: number) => Math.round(n * 100) / 100;
export function courseProgress(state: Workspace, course: Course) {
  let legacy = course.completedMinutes;
  const budgets = {
    lesson: course.lessons?.length
      ? course.lessons.reduce((n, l) => n + l.minutes, 0)
      : course.minutes,
    practice: course.practiceMinutes,
    review: course.reviewMinutes,
  };
  return (Object.entries(budgets) as [Kind, number | null][]).reduce((sum, [kind, budget]) => {
    if (budget === null) {
      legacy = 0;
      return sum;
    }
    const historical = Math.min(legacy, budget);
    legacy -= historical;
    return (
      sum +
      Math.min(
        budget,
        historical +
          state.sessions
            .filter((s) => s.courseId === course.id && s.kind === kind)
            .reduce((n, s) => n + s.completedMinutes, 0),
      )
    );
  }, 0);
}
export function recordSession(
  state: Workspace,
  item: PlanItem,
  actualMinutes: number,
  completedMinutes = item.workMinutes,
  date = dateKey(new Date()),
): Workspace {
  if (state.sessions.some((s) => s.id === item.id)) return state;
  if (
    !Number.isFinite(actualMinutes) ||
    actualMinutes <= 0 ||
    actualMinutes > 720 ||
    !Number.isFinite(completedMinutes) ||
    completedMinutes < 0 ||
    completedMinutes > item.workMinutes
  )
    throw new Error(
      'Informe o tempo gasto e um progresso entre zero e o trabalho previsto para este bloco.',
    );
  return {
    ...state,
    sessions: [
      ...state.sessions,
      {
        id: item.id,
        taskId: item.taskId,
        courseId: item.courseId,
        title: item.title,
        kind: item.kind,
        date,
        actualMinutes,
        completedMinutes,
      },
    ],
  };
}

export function planStudy(state: Workspace, today = new Date()) {
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const todayKey = dateKey(start);
  const tasks: Task[] = [],
    unknown: Array<{ courseId: string; missing: number | null }> = [];
  const courses = [...state.courses].sort(
    (a, b) =>
      (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.id.localeCompare(b.id),
  );
  const completedByTask = new Map<string, number>(),
    countByTask = new Map<string, number>(),
    loggedByDay = new Map<string, number>();
  for (const session of state.sessions) {
    completedByTask.set(
      session.taskId,
      (completedByTask.get(session.taskId) || 0) + session.completedMinutes,
    );
    countByTask.set(session.taskId, (countByTask.get(session.taskId) || 0) + 1);
    loggedByDay.set(session.date, (loggedByDay.get(session.date) || 0) + session.actualMinutes);
  }
  const done = (id: string) => completedByTask.get(id) || 0;
  const kinds: Kind[] = ['lesson', 'practice', 'review'];
  // Pace is an estimate from the last 20 completed/partial sessions, separate from mastery.
  const pace = Object.fromEntries(
    kinds.map((kind) => {
      const sessions = state.sessions
        .filter((s) => s.kind === kind && s.completedMinutes > 0)
        .slice(-20);
      const work = sessions.reduce((sum, s) => sum + s.completedMinutes, 0);
      return [
        kind,
        work
          ? Math.min(3, Math.max(0.5, sessions.reduce((sum, s) => sum + s.actualMinutes, 0) / work))
          : 1,
      ];
    }),
  ) as Record<Kind, number>;
  const reviewBudget = new Map<string, number>();
  for (const c of courses) {
    let legacy = c.completedMinutes;
    const consumeLegacy = (minutes: number) => {
      const used = Math.min(legacy, minutes);
      legacy -= used;
      return minutes - used;
    };
    const lessons = c.lessons?.length
      ? c.lessons
      : c.minutes !== null
        ? [{ id: 'total', title: c.title, minutes: c.minutes }]
        : [];
    if (!lessons.length && c.minutes === null) {
      unknown.push({ courseId: c.id, missing: null });
      legacy = 0;
    }
    const lessonIds = new Set(lessons.map((l) => `lesson:${c.id}:${l.id}`));
    // Backups/manual edits can rename an old task. Preserve its recorded lesson progress.
    let orphanedLessonProgress = state.sessions
      .filter((s) => s.courseId === c.id && s.kind === 'lesson' && !lessonIds.has(s.taskId))
      .reduce((sum, s) => sum + s.completedMinutes, 0);
    for (const [order, l] of lessons.entries()) {
      const id = `lesson:${c.id}:${l.id}`;
      const uncredited = Math.max(0, consumeLegacy(l.minutes) - done(id));
      const carried = Math.min(uncredited, orphanedLessonProgress);
      orphanedLessonProgress -= carried;
      tasks.push({
        id,
        order,
        courseId: c.id,
        title: l.title,
        kind: 'lesson',
        remaining: uncredited - carried,
        deadline: c.deadline || undefined,
        priority: 2,
        reason: 'Conteúdo ainda não concluído',
      });
    }
    const practiceId = `practice:${c.id}`;
    const recent = state.concepts
      .filter((n) => n.courseIds.includes(c.id))
      .flatMap((n) => n.attempts.slice(-3));
    const weak = recent.length > 0 && recent.filter((a) => a.correct).length / recent.length < 0.8;
    tasks.push({
      id: practiceId,
      courseId: c.id,
      title: `Prática · ${c.title}`,
      kind: 'practice',
      remaining: Math.max(0, consumeLegacy(c.practiceMinutes) - done(practiceId)),
      deadline: c.deadline || undefined,
      priority: weak ? 0 : 3,
      reason: weak ? 'Reforço: menos de 80% de acertos recentes' : 'Aplicar o conteúdo estudado',
    });
    const completedReview = state.sessions
      .filter((s) => s.courseId === c.id && s.kind === 'review')
      .reduce((sum, s) => sum + s.completedMinutes, 0);
    reviewBudget.set(c.id, Math.max(0, consumeLegacy(c.reviewMinutes) - completedReview));
  }
  // A shared concept creates ONE review, regardless of the number of linked courses.
  for (const n of state.concepts.filter((n) => n.question || exercisesOf(n).length > 0)) {
    const c = courses.find((c) => n.courseIds.includes(c.id));
    const id = `review:${n.id}:${n.due}`;
    const remaining = Math.max(0, 5 - done(id));
    if (!remaining) continue;
    tasks.push({
      id,
      courseId: c?.id || '',
      title: `Revisar · ${n.label}`,
      kind: 'review',
      remaining,
      due: n.due ? dateKey(new Date(n.due)) : todayKey,
      deadline: c?.deadline || undefined,
      priority: n.attempts.at(-1)?.correct === false ? -2 : -1,
      reason:
        n.attempts.at(-1)?.correct === false
          ? 'Revisão após uma resposta incorreta'
          : 'Revisão espaçada pendente',
    });
    if (c) reviewBudget.set(c.id, Math.max(0, (reviewBudget.get(c.id) || 0) - remaining));
  }
  for (const c of courses)
    tasks.push({
      id: `review-budget:${c.id}`,
      courseId: c.id,
      title: `Revisão do curso · ${c.title}`,
      kind: 'review',
      remaining: reviewBudget.get(c.id) || 0,
      deadline: c.deadline || undefined,
      priority: 4,
      reason: 'Reserva de revisão prevista no curso',
    });
  const finish: Record<string, string> = {};
  const missedAtDeadline: Record<string, number> = {};
  const remainingFor = (courseId: string) =>
    Math.ceil(
      tasks
        .filter((t) => t.courseId === courseId)
        .reduce((sum, t) => sum + t.remaining * pace[t.kind], 0),
    );
  for (const c of courses) {
    if (c.deadline && c.deadline < todayKey) missedAtDeadline[c.id] = remainingFor(c.id);
    if (!unknown.some((u) => u.courseId === c.id) && remainingFor(c.id) === 0)
      finish[c.id] = todayKey;
  }
  const days = [];
  for (let offset = 0; offset < 366; offset++) {
    const d = new Date(start);
    d.setDate(start.getDate() + offset);
    const date = dateKey(d),
      limit = state.dayOverrides[date] ?? state.availability[d.getDay()];
    const logged = loggedByDay.get(date) || 0;
    let capacity = Math.max(0, limit - logged),
      breaks = 0;
    const items: PlanItem[] = [];
    // Energy is today's state, not a prediction that all future days will be identical.
    const energy =
      offset === 0 && (!state.energyDate || state.energyDate === todayKey)
        ? state.energy
        : 'normal';
    const block = { tired: 15, normal: 25, focused: 40, hyperfocused: 40 }[energy];
    const pause = energy === 'tired' || energy === 'hyperfocused' ? 10 : 5;
    let lastKind: Kind | undefined;
    while (capacity >= 1) {
      const candidates = tasks.filter(
        (t) =>
          t.remaining > 0.001 &&
          (!t.due || t.due <= date) &&
          (t.kind !== 'lesson' ||
            !tasks.some(
              (previous) =>
                previous.courseId === t.courseId &&
                previous.kind === 'lesson' &&
                (previous.order || 0) < (t.order || 0) &&
                previous.remaining > 0.001,
            )),
      );
      candidates.sort((a, b) => {
        // Earliest commitments first. A concept's spaced-review date is also a commitment.
        const effectiveDeadline = (t: Task) => [t.deadline || '9999', t.due || '9999'].sort()[0];
        const score = (t: Task) =>
          t.priority +
          (energy === 'tired' && t.kind === 'review' ? -3 : 0) +
          (['focused', 'hyperfocused'].includes(energy) && t.kind === 'practice' ? -3 : 0) +
          (lastKind === t.kind ? 2 : 0);
        return (
          effectiveDeadline(a).localeCompare(effectiveDeadline(b)) ||
          score(a) - score(b) ||
          (a.order || 0) - (b.order || 0) ||
          a.id.localeCompare(b.id)
        );
      });
      const task = candidates[0];
      if (!task) break;
      if (items.length || logged > 0) {
        // Reserve a full pause and at least one study minute; don't create an orphan pause.
        if (capacity < pause + 1) break;
        capacity -= pause;
        breaks += pause;
      }
      const availableWork = Math.min(
        task.remaining,
        block / pace[task.kind],
        capacity / pace[task.kind],
      );
      const workMinutes =
        availableWork < 0.01
          ? availableWork
          : Math.floor((availableWork + Number.EPSILON) * 100) / 100;
      const minutes = Math.min(capacity, Math.max(1, Math.ceil(workMinutes * pace[task.kind])));
      if (workMinutes <= 0) break;
      const id = `${date}:${task.id}:${round(task.remaining)}:${countByTask.get(task.id) || 0}`;
      items.push({
        id,
        taskId: task.id,
        courseId: task.courseId,
        title: task.title,
        kind: task.kind,
        minutes,
        workMinutes,
        reason: task.reason,
        ...(SUGGESTED_MODE[task.kind] ? { suggestedMode: SUGGESTED_MODE[task.kind] } : {}),
      });
      capacity = round(capacity - minutes);
      task.remaining = round(task.remaining - workMinutes);
      lastKind = task.kind;
      if (
        task.courseId &&
        !unknown.some((u) => u.courseId === task.courseId) &&
        !tasks.some((t) => t.courseId === task.courseId && t.remaining > 0.001)
      )
        finish[task.courseId] = date;
    }
    for (const c of courses)
      if (c.deadline && c.deadline <= date && missedAtDeadline[c.id] === undefined)
        missedAtDeadline[c.id] = remainingFor(c.id);
    days.push({ date, limit, logged, capacity, breaks, items });
  }
  const conflicts = [...unknown];
  for (const c of courses) {
    const missing = missedAtDeadline[c.id] ?? remainingFor(c.id);
    if (missing > 0 && !unknown.some((u) => u.courseId === c.id))
      conflicts.push({ courseId: c.id, missing });
  }
  return { days: days.slice(0, 14), conflicts, finish, pace };
}
