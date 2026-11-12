import { describe, expect, it } from 'vitest';
import { emptyWorkspace, workspaceSchema } from '@/lib/study/domain';
import {
  addImprovementFeedback,
  chooseImprovement,
  evaluateImprovement,
  type Improvement,
} from '@/lib/study/improvement';

function vote(
  state: Improvement,
  kind: 'questions' | 'teaching',
  variant: 'baseline' | 'candidate',
  helpful: boolean,
  id: string,
) {
  return addImprovementFeedback(state, { id, kind, variant, helpful });
}

describe('local improvement cycle', () => {
  it('alternates versions by independent learner feedback without inferring quality from quiz errors', () => {
    let state = emptyWorkspace().improvement;
    expect(chooseImprovement(state, 'questions')).toBe('baseline');
    state = vote(state, 'questions', 'baseline', false, 'first');
    expect(chooseImprovement(state, 'questions')).toBe('candidate');
    expect(chooseImprovement(state, 'teaching')).toBe('baseline');
    state = vote(state, 'questions', 'candidate', true, 'second');
    expect(chooseImprovement(state, 'questions')).toBe('baseline');
    expect(evaluateImprovement(state, 'questions').adopted).toBe(false);
  });
  it('adopts only with enough ratings and a margin, and can revert as feedback changes', () => {
    let state = emptyWorkspace().improvement;
    for (let i = 0; i < 10; i++) {
      state = vote(state, 'teaching', 'baseline', i < 5, `b${i}`);
      state = vote(state, 'teaching', 'candidate', i < 8, `c${i}`);
    }
    expect(evaluateImprovement(state, 'teaching').adopted).toBe(true);
    expect(chooseImprovement(state, 'teaching')).toBe('candidate');
    for (let i = 10; i < 20; i++) state = vote(state, 'teaching', 'candidate', false, `c${i}`);
    expect(evaluateImprovement(state, 'teaching').adopted).toBe(false);
    expect(chooseImprovement(state, 'teaching')).toBe('baseline');
    expect(chooseImprovement({ events: [] }, 'teaching')).toBe('baseline');
  });
  it('deduplicates a rating, keeps observations bounded, and hydrates old workspaces', () => {
    const first = vote({ events: [] }, 'questions', 'baseline', true, 'same');
    expect(vote(first, 'questions', 'candidate', false, 'same')).toEqual(first);
    let state = first;
    for (let i = 0; i < 210; i++) state = vote(state, 'questions', 'baseline', true, `i${i}`);
    expect(state.events).toHaveLength(200);
    const { improvement, ...legacy } = emptyWorkspace();
    expect(workspaceSchema.parse(legacy).improvement).toEqual({ events: [] });
    expect(
      workspaceSchema.parse({ ...legacy, improvement: state }).improvement.events,
    ).toHaveLength(200);
  });
});
