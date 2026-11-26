import { describe, expect, it } from 'vitest';
import { mastery, recordAnswer, type Concept } from '@/lib/study/domain';
import { graphStatus } from '@/lib/study/graph-status';

const day = 86400000;
const start = new Date('2026-11-03T12:00:00-03:00').getTime();
const base: Concept = {
  id: 'lifecycle',
  label: 'Lógica',
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [],
  due: 0,
};

describe('learning lifecycle', () => {
  it('moves from new to learning, due review, mastery and back through spaced review', () => {
    expect(graphStatus(base, start)).toBe('new');
    let n = recordAnswer(base, true, 'choice', 1, start);
    expect(n.due).toBe(start + day);
    expect(graphStatus(n, n.due - 1)).toBe('learning');
    expect(graphStatus(n, n.due)).toBe('review');
    n = recordAnswer(n, true, 'choice', 1, n.due);
    expect(n.due).toBe(start + 4 * day);
    expect(mastery(n).mastered).toBe(false);
    n = recordAnswer(n, true, 'write', 1, n.due);
    expect(n.due).toBe(start + 11 * day);
    expect(mastery(n).mastered).toBe(false);
    expect(graphStatus(n, start + 4 * day)).toBe('learning');
    n = recordAnswer(n, true, 'write', 1, n.due);
    expect(n.due).toBe(start + 25 * day);
    expect(graphStatus(n, start + 11 * day)).toBe('mastered');
    expect(graphStatus(n, n.due)).toBe('review');
    const reviewedAt = n.due;
    n = recordAnswer(n, true, 'choice', 1, reviewedAt, undefined, { mode: 'revisao' });
    expect(n.due).toBe(reviewedAt + 30 * day);
    expect(graphStatus(n, reviewedAt)).toBe('mastered');
  });
  it('does not replace spaced evidence with repeated correct answers on one day', () => {
    let n = base;
    for (let i = 0; i < 20; i++) n = recordAnswer(n, true, 'application', 1, start + i * 1000);
    expect(mastery(n).days).toBe(1);
    expect(mastery(n).mastered).toBe(false);
    expect(n.due).toBe(start + 19000 + day);
  });
  it('a miss in spaced review returns the concept to learning; a miss elsewhere does not', () => {
    let n = recordAnswer(
      recordAnswer(base, true, 'write', 1, start),
      true,
      'write',
      1,
      start + 3 * day,
    );
    expect(mastery(n).mastered).toBe(true);
    n = recordAnswer(n, false, 'choice', 0, start + 4 * day, undefined, { mode: 'prova' });
    expect(n.due).toBe(start + 5 * day);
    expect(graphStatus(n, start + 4 * day)).toBe('mastered');
    n = recordAnswer(n, false, 'choice', 0, start + 5 * day, undefined, { mode: 'revisao' });
    expect(n.due).toBe(start + 6 * day);
    expect(graphStatus(n, start + 5 * day)).toBe('learning');
    n = recordAnswer(
      recordAnswer(n, true, 'write', 1, start + 6 * day),
      true,
      'write',
      1,
      start + 9 * day,
    );
    expect(graphStatus(n, start + 9 * day)).toBe('mastered');
  });
});
