import { describe, it, expect } from 'vitest';
import {
  emptyWorkspace,
  mastery,
  recordAnswer,
  planStudy,
  validateReferences,
  type Concept,
  type Course,
} from '@/lib/study/domain';
import { incorporateMaterial } from '@/lib/study/incorporate';
import { subscriptionGuard, codexEnvironment } from '@/lib/study/runtime/codex';
const concept: Concept = {
  id: 'one',
  label: 'Memória',
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [],
  due: 0,
};
const course = (id: string): Course => ({
  id,
  title: id,
  url: '',
  minutes: 120,
  practiceMinutes: 30,
  reviewMinutes: 30,
  completedMinutes: 0,
  deadline: '2026-11-03',
  hoursSource: 'estimate',
  sourceNote: '',
});
describe('learning evidence', () => {
  it('does not count a retried classroom callback twice', () => {
    const n = recordAnswer(concept, true, 'choice', 1, Date.now(), 'attempt-one');
    expect(recordAnswer(n, true, 'choice', 1, Date.now(), 'attempt-one').attempts).toHaveLength(1);
  });
  it('does not award mastery for creation or one correct answer', () => {
    expect(mastery(concept).fraction).toBe(0);
    expect(mastery(recordAnswer(concept, true, 'choice')).mastered).toBe(false);
  });
  it('requires two unaided demonstrations at least 3 days apart', () => {
    const now = new Date('2026-11-02T12:00:00').getTime();
    let n = concept;
    for (let day = 0; day < 4; day++) n = recordAnswer(n, true, 'choice', 1, now + day * 86400000);
    expect(mastery(n).mastered).toBe(false);
    n = recordAnswer(n, true, 'application', 1, now + 4 * 86400000);
    expect(mastery(n).mastered).toBe(false);
    expect(mastery(recordAnswer(n, true, 'application', 1, now + 7 * 86400000)).mastered).toBe(
      true,
    );
  });
  it('shares a daily capacity between courses and reports impossible deadlines', () => {
    const state = {
      ...emptyWorkspace(),
      availability: [60, 60, 60, 60, 60, 60, 60],
      courses: [course('a'), course('b')],
    };
    const plan = planStudy(state, new Date('2026-11-02T12:00:00'));
    expect(
      plan.days.every(
        (d) => d.items.reduce((sum, i) => sum + i.minutes, 0) + d.breaks + d.logged <= 60,
      ),
    ).toBe(true);
    expect(plan.conflicts).toEqual([
      { courseId: 'a', missing: 80 },
      { courseId: 'b', missing: 180 },
    ]);
    const focused = planStudy(
      { ...state, energy: 'hyperfocused' },
      new Date('2026-11-02T12:00:00'),
    );
    expect(focused.days[0].items).not.toEqual(plan.days[0].items);
    expect(
      focused.days.every((d) => d.items.reduce((sum, i) => sum + i.minutes, 0) + d.breaks <= 60),
    ).toBe(true);
  });
  it('never invents unknown hours', () => {
    expect(
      planStudy({ ...emptyWorkspace(), courses: [{ ...course('a'), minutes: null }] }).conflicts[0]
        .missing,
    ).toBeNull();
  });
  it('merges reviewed material idempotently while retaining course evidence', () => {
    let state = {
      ...emptyWorkspace(),
      courses: [course('a'), course('b')],
      concepts: [{ ...concept, courseIds: ['a'] }],
    };
    const result = {
      concepts: [
        {
          id: 'new',
          label: 'Memória',
          summary: 'Resumo',
          evidence: 'Trecho real',
          startSeconds: 0,
          endSeconds: 8,
          mediaUrl: '/api/study/media/job/clip-0.mp4',
        },
      ],
      connections: [],
    };
    state = incorporateMaterial(state, result, 'b', { new: 'one' });
    state = incorporateMaterial(state, result, 'b', {});
    expect(state.concepts).toHaveLength(1);
    expect(state.concepts[0].courseIds).toEqual(['a', 'b']);
    expect(state.concepts[0].evidence).toHaveLength(1);
    expect(mastery(state.concepts[0]).mastered).toBe(false);
  });
  it('rejects orphan links and memberships', () => {
    expect(() =>
      validateReferences({
        ...emptyWorkspace(),
        concepts: [{ ...concept, courseIds: ['missing'] }],
      }),
    ).toThrow();
    expect(() =>
      validateReferences({
        ...emptyWorkspace(),
        connections: [{ id: 'e', source: 'a', target: 'b', relation: 'r' }],
      }),
    ).toThrow();
  });
});
describe('subscription boundary', () => {
  const allowed = {
    rateLimits: {
      primary: { usedPercent: 10 },
      secondary: { usedPercent: 40 },
      credits: { hasCredits: false, unlimited: false, balance: '0' },
    },
  };
  it('requires ChatGPT auth and confirmed limits', () => {
    expect(() => subscriptionGuard({ type: 'apiKey' }, allowed)).toThrow();
    expect(() => subscriptionGuard({ type: 'chatgpt' }, {})).toThrow();
    expect(subscriptionGuard({ type: 'chatgpt' }, allowed)).toBeTruthy();
  });
  it('pauses before exhaustion and when purchased credits exist', () => {
    expect(() =>
      subscriptionGuard(
        { type: 'chatgpt' },
        { rateLimits: { ...allowed.rateLimits, secondary: { usedPercent: 95 } } },
      ),
    ).toThrow();
    expect(() =>
      subscriptionGuard(
        { type: 'chatgpt' },
        { rateLimits: { ...allowed.rateLimits, credits: { hasCredits: true, balance: '1' } } },
      ),
    ).toThrow();
  });
  it('strips API credentials only from the spawned child environment', () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only';
    try {
      expect(codexEnvironment().OPENAI_API_KEY).toBeUndefined();
      expect(process.env.OPENAI_API_KEY).toBe('test-only');
    } finally {
      if (old === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = old;
    }
  });
});

describe('curso importado (etapa 5)', () => {
  it('workspace antigo sem os campos novos continua válido', async () => {
    const { courseSchema } = await import('@/lib/study/domain');
    const old = courseSchema.parse({
      id: 'c',
      title: 'Antigo',
      minutes: 60,
      deadline: null,
      hoursSource: 'official',
      lessons: [{ id: 'l1', title: 'Aula', minutes: 30 }],
    });
    expect(old.lessons![0]).toEqual({ id: 'l1', title: 'Aula', minutes: 30 });
    const imported = courseSchema.parse({
      ...old,
      origin: 'ocw',
      license: 'CC BY-NC-SA',
      importSource: 'C:/x.zip',
      lessons: [
        { id: 'l1', title: 'Aula', minutes: 5, status: 'processada', summary: 'r', sourceIds: ['s'], minutesEstimated: true },
      ],
    });
    expect(imported.origin).toBe('ocw');
    expect(imported.lessons![0].status).toBe('processada');
    expect(imported.lessons![0].sourceIds).toEqual(['s']);
  });
});
