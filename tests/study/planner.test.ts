import { describe, expect, it } from 'vitest';
import {
  emptyWorkspace,
  workspaceSchema,
  type Course,
  type Concept,
  type Workspace,
} from '@/lib/study/domain';
import { courseProgress, dateKey, planStudy, recordSession } from '@/lib/study/planner';

const today = new Date('2026-11-02T12:00:00');
const course = (extra: Partial<Course> = {}): Course => ({
  id: 'course',
  title: 'Curso',
  url: '',
  minutes: 120,
  practiceMinutes: 0,
  reviewMinutes: 0,
  completedMinutes: 0,
  deadline: null,
  hoursSource: 'estimate',
  sourceNote: '',
  ...extra,
});
const concept = (extra: Partial<Concept> = {}): Concept => ({
  id: 'memory',
  label: 'Memória',
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: ['course'],
  evidence: [],
  attempts: [],
  due: 0,
  question: { question: 'Qual?', options: ['A', 'B', 'C', 'D'], answerIndex: 0, explanation: 'A' },
  ...extra,
});
const workspace = (extra: Partial<Workspace> = {}): Workspace => ({
  ...emptyWorkspace(),
  availability: [60, 60, 60, 60, 60, 60, 60],
  courses: [course()],
  ...extra,
});
const scheduledWork = (state: Workspace) =>
  planStudy(state, today)
    .days.flatMap((d) => d.items)
    .reduce((n, item) => n + item.workMinutes, 0);

describe('adaptive planning without inference', () => {
  it('hydrates old backups with empty logs and overrides', () => {
    const { sessions, dayOverrides, ...legacy } = workspace();
    const restored = workspaceSchema.parse(legacy);
    expect(restored.sessions).toEqual([]);
    expect(restored.dayOverrides).toEqual({});
    expect(planStudy(restored, today).days[0].items.length).toBeGreaterThan(0);
  });

  it('keeps study, pauses and recorded time within shared capacity for every energy state', () => {
    for (const energy of ['tired', 'normal', 'focused', 'hyperfocused'] as const) {
      const state = workspace({
        energy,
        courses: [course({ minutes: 1000 }), course({ id: 'two', minutes: 1000 })],
      });
      const first = planStudy(state, today).days[0].items[0];
      const logged = recordSession(state, first, 13, 8, dateKey(today));
      for (const day of planStudy(logged, today).days) {
        expect(
          day.items.reduce((n, i) => n + i.minutes, 0) + day.breaks + day.logged + day.capacity,
        ).toBeCloseTo(day.limit);
        expect(day.items.every((i) => i.minutes > 0 && i.workMinutes > 0)).toBe(true);
      }
      expect(planStudy(logged, today).days[0].breaks).toBeGreaterThan(0);
    }
  });

  it('never schedules more today when the user has already exceeded the limit', () => {
    const state = workspace();
    const logged = recordSession(
      state,
      planStudy(state, today).days[0].items[0],
      90,
      10,
      dateKey(today),
    );
    const plan = planStudy(logged, today);
    expect(plan.days[0].logged).toBe(90);
    expect(plan.days[0].items).toEqual([]);
    expect(plan.days[1].limit).toBe(60);
    expect(
      plan.days[1].items.reduce((n, i) => n + i.minutes, 0) + plan.days[1].breaks,
    ).toBeLessThanOrEqual(60);
  });

  it('records partial work once, retains unfinished work, and learns pace from real time', () => {
    const state = workspace({ courses: [course({ minutes: 50 })] });
    const item = planStudy(state, today).days[0].items[0];
    const logged = recordSession(state, item, 30, 10, dateKey(today));
    expect(recordSession(logged, item, 30, 10, dateKey(today))).toBe(logged);
    expect(courseProgress(logged, logged.courses[0])).toBe(10);
    const plan = planStudy(logged, today);
    expect(plan.pace.lesson).toBe(3);
    expect(scheduledWork(logged)).toBeCloseTo(40);
    expect(logged.concepts).toEqual(state.concepts);
    expect(() => recordSession(state, item, 1, item.workMinutes + 1)).toThrow();
    expect(() => recordSession(state, item, Number.NaN)).toThrow();
  });

  it('moves skipped and missed days forward without treating a plan as completion', () => {
    const state = workspace({ dayOverrides: { '2026-11-02': 0 } });
    const skipped = planStudy(state, today);
    expect(skipped.days[0].items).toEqual([]);
    expect(skipped.days[1].items.length).toBeGreaterThan(0);
    const nextDay = planStudy(state, new Date('2026-11-03T12:00:00'));
    expect(nextDay.days.flatMap((d) => d.items).reduce((n, i) => n + i.workMinutes, 0)).toBeCloseTo(
      120,
    );
    expect(state.sessions).toEqual([]);
  });

  it('reports all outstanding work against an already expired deadline, before today’s allocation', () => {
    const state = workspace({ courses: [course({ minutes: 30, deadline: '2026-11-01' })] });
    const plan = planStudy(state, today);
    expect(plan.conflicts).toEqual([{ courseId: 'course', missing: 30 }]);
    expect(plan.finish.course).toBe('2026-11-02');
    expect(plan.days[0].items.reduce((n, i) => n + i.workMinutes, 0)).toBe(30);
  });

  it('preserves lesson order independently of UUID sorting', () => {
    const state = workspace({
      courses: [
        course({
          minutes: 30,
          lessons: [
            { id: 'zz', title: 'Fundamentos', minutes: 10 },
            { id: 'aa', title: 'Avançado', minutes: 20 },
          ],
        }),
      ],
    });
    expect(planStudy(state, today).days[0].items.map((i) => i.title)).toEqual([
      'Fundamentos',
      'Avançado',
    ]);
  });

  it('uses one review for a concept shared by courses and does not mark mastery from a time log', () => {
    const node = concept({ courseIds: ['course', 'two'] });
    const state = workspace({
      courses: [course({ minutes: 0 }), course({ id: 'two', minutes: 0 })],
      concepts: [node],
    });
    const reviews = planStudy(state, today)
      .days.flatMap((d) => d.items)
      .filter((i) => i.kind === 'review');
    expect(reviews).toHaveLength(1);
    const logged = recordSession(state, reviews[0], 5, reviews[0].workMinutes, dateKey(today));
    expect(
      planStudy(logged, today)
        .days.flatMap((d) => d.items)
        .filter((i) => i.kind === 'review'),
    ).toEqual([]);
    expect(logged.concepts[0]).toEqual(node);
    // Extra review time must not claim lesson/practice progress in course cards.
    expect(courseProgress(logged, state.courses[0])).toBe(0);
  });

  it('waits until a concept is due and schedules a new review cycle after a new assessment', () => {
    const due = new Date('2026-11-04T12:00:00').getTime();
    const state = workspace({ courses: [course({ minutes: 0 })], concepts: [concept({ due })] });
    const plan = planStudy(state, today);
    expect(plan.days[0].items).toEqual([]);
    expect(plan.days[1].items).toEqual([]);
    const review = plan.days[2].items[0];
    const logged = recordSession(state, review, 5, 5, '2026-11-04');
    const assessed = { ...logged, concepts: [concept({ due: due + 86400000 })] };
    expect(planStudy(assessed, today).days[3].items.some((i) => i.kind === 'review')).toBe(true);
  });

  it('does not invent unknown course completion from known practice hours', () => {
    const state = workspace({
      courses: [course({ minutes: null, practiceMinutes: 10, completedMinutes: 200 })],
    });
    const plan = planStudy(state, today);
    expect(plan.conflicts).toEqual([{ courseId: 'course', missing: null }]);
    expect(plan.finish.course).toBeUndefined();
    expect(plan.days[0].items[0].kind).toBe('practice');
    expect(plan.days[0].items[0].workMinutes).toBe(10);
  });

  it('credits legacy progress once and preserves logged lesson work across renamed tasks', () => {
    const state = workspace({ courses: [course({ minutes: 60, completedMinutes: 10 })] });
    const item = planStudy(state, today).days[0].items[0];
    const logged = recordSession(state, item, 10, 10, dateKey(today));
    expect(scheduledWork(logged)).toBeCloseTo(40);
    expect(courseProgress(logged, logged.courses[0])).toBe(20);
    const renamed = {
      ...logged,
      courses: [{ ...logged.courses[0], lessons: [{ id: 'renamed', title: 'Aula', minutes: 60 }] }],
    };
    expect(scheduledWork(renamed)).toBeCloseTo(40);
  });

  it('changes today’s blocks and activity mix without predicting today’s energy for tomorrow', () => {
    const base = workspace({ courses: [course({ minutes: 200, practiceMinutes: 100 })] });
    const normal = planStudy(base, today);
    const focused = planStudy({ ...base, energy: 'focused' }, today);
    const tired = planStudy({ ...base, energy: 'tired' }, today);
    expect(normal.days[0].items[0].kind).toBe('lesson');
    expect(focused.days[0].items[0].kind).toBe('practice');
    expect(tired.days[0].items.every((i) => i.minutes <= 15)).toBe(true);
    expect(focused.days[0].items[0].minutes).toBe(40);
    expect(focused.days[1].items.every((i) => i.minutes <= 25)).toBe(true);
    expect(tired.days[1].items.some((i) => i.minutes === 25)).toBe(true);
  });

  it('expires the selected energy state on the next calendar day', () => {
    const state = workspace({
      energy: 'tired',
      energyDate: '2026-11-02',
      courses: [course({ minutes: 200 })],
    });
    const selectedDay = planStudy(state, today);
    expect(selectedDay.days[0].items.every((i) => i.minutes <= 15)).toBe(true);
    const nextDay = planStudy(state, new Date('2026-11-03T12:00:00'));
    expect(nextDay.days[0].items[0].minutes).toBe(25);
    expect(nextDay).toEqual(
      planStudy({ ...state, energy: 'normal' }, new Date('2026-11-03T12:00:00')),
    );
    // An explicit state from another date must never forecast today's energy.
    expect(planStudy({ ...state, energyDate: '2026-11-04' }, today).days[0].items[0].minutes).toBe(
      25,
    );
  });

  it('finishes fractional remaining minutes without blocking later tasks', () => {
    const state = workspace({
      courses: [course({ minutes: 0.005 }), course({ id: 'two', minutes: 10 })],
    });
    const plan = planStudy(state, today);
    expect(plan.finish.course).toBe('2026-11-02');
    expect(plan.finish.two).toBe('2026-11-02');
    expect(plan.conflicts).toEqual([]);
  });

  it('prioritizes a near deadline over a distant course’s weak practice', () => {
    const state = workspace({
      courses: [
        course({ deadline: '2026-11-03', minutes: 20 }),
        course({ id: 'two', deadline: '2026-12-01', minutes: 0, practiceMinutes: 100 }),
      ],
      concepts: [
        concept({
          courseIds: ['two'],
          question: undefined,
          attempts: [{ at: today.getTime(), correct: false, kind: 'choice', score: 0 }],
        }),
      ],
    });
    expect(planStudy(state, today).days[0].items[0].courseId).toBe('course');
  });
});

describe('modos de estudo no planejador', () => {
  const choiceExercise = {
    type: 'escolha' as const,
    id: 'e1',
    prompt: 'p',
    options: ['a', 'b'],
    answerIndexes: [0],
    explanation: '',
  };
  it('conceito só com exercises gera tarefa de revisão', () => {
    const state = workspace({
      concepts: [concept({ question: undefined, exercises: [choiceExercise] })],
    });
    const items = planStudy(state, today).days.flatMap((d) => d.items);
    expect(items.some((i) => i.kind === 'review' && i.title.includes('Memória'))).toBe(true);
  });
  it('conceito sem pergunta nem exercícios não gera revisão', () => {
    const state = workspace({ concepts: [concept({ question: undefined, exercises: [] })] });
    const items = planStudy(state, today).days.flatMap((d) => d.items);
    expect(items.some((i) => i.kind === 'review')).toBe(false);
  });
  it('tarefa de revisão sugere revisao e prática sugere aprofundar', () => {
    const state = workspace({
      courses: [course({ practiceMinutes: 30 })],
      concepts: [concept()],
    });
    const items = planStudy(state, today).days.flatMap((d) => d.items);
    expect(items.find((i) => i.kind === 'review')?.suggestedMode).toBe('revisao');
    expect(items.find((i) => i.kind === 'practice')?.suggestedMode).toBe('aprofundar');
    expect(items.find((i) => i.kind === 'lesson')?.suggestedMode).toBeUndefined();
  });
});
