import { mastery, type Concept } from './domain';

export const graphStatuses = {
  new: { label: 'Ainda não praticado', symbol: '○' },
  learning: { label: 'Em aprendizagem', symbol: '↗' },
  review: { label: 'Revisão pendente', symbol: '↻' },
  mastered: { label: 'Domínio em dia', symbol: '✓' },
};
export function graphStatus(node: Concept, now = Date.now()): keyof typeof graphStatuses {
  if (!node.attempts.length) return 'new';
  // A concept can retain demonstrated mastery while still needing spaced review.
  if (node.due > 0 && node.due <= now) return 'review';
  if (mastery(node).mastered) return 'mastered';
  return 'learning';
}
