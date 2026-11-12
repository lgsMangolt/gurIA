import { z } from 'zod';

// These observations express learner preference, not correctness or learning outcomes.
export const improvementEventSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(['questions', 'teaching']),
  variant: z.enum(['baseline', 'candidate']),
  helpful: z.boolean(),
});
export const improvementSchema = z
  .object({
    events: z.array(improvementEventSchema).max(200).default([]),
  })
  .default({ events: [] });
export type Improvement = z.infer<typeof improvementSchema>;
export type ImprovementEvent = z.infer<typeof improvementEventSchema>;
export type ImprovementKind = ImprovementEvent['kind'];
export type Variant = ImprovementEvent['variant'];

export function evaluateImprovement(state: Improvement, kind: ImprovementKind) {
  const relevant = state.events.filter((event) => event.kind === kind);
  const summarize = (variant: Variant) => {
    const votes = relevant.filter((event) => event.variant === variant);
    return { total: votes.length, positive: votes.filter((vote) => vote.helpful).length };
  };
  const baseline = summarize('baseline');
  const candidate = summarize('candidate');
  // A conservative preference heuristic; not a statistical or pedagogical proof.
  const adopted =
    baseline.total >= 10 &&
    candidate.total >= 10 &&
    candidate.positive / candidate.total >= baseline.positive / baseline.total + 0.2;
  return { baseline, candidate, adopted };
}

export function chooseImprovement(state: Improvement, kind: ImprovementKind): Variant {
  const result = evaluateImprovement(state, kind);
  if (result.adopted) return 'candidate';
  // Balance observed feedback, not unconfirmed impressions.
  return result.baseline.total <= result.candidate.total ? 'baseline' : 'candidate';
}

export function addImprovementFeedback(state: Improvement, event: ImprovementEvent): Improvement {
  const checked = improvementEventSchema.parse(event);
  if (state.events.some((existing) => existing.id === checked.id)) return state;
  return { events: [...state.events, checked].slice(-200) };
}
