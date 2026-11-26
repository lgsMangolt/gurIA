import { describe, it, expect } from 'vitest';
import { emptyWorkspace, recordAnswer, workspaceSchema, type Concept } from '@/lib/study/domain';

const DAY = 86400000;
const base: Concept = {
  id: 'c1',
  label: 'Memória',
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [],
  due: 0,
} as Concept;
const t0 = new Date('2026-11-02T12:00:00').getTime();
const withAttempt = (attempt: Record<string, unknown>) => ({
  ...emptyWorkspace(),
  concepts: [{ ...base, attempts: [attempt] }],
});

describe('metadados da tentativa', () => {
  it('guarda modo, ajuda, confiança e sessão na tentativa', () => {
    const n = recordAnswer(base, true, 'write', 1, t0, undefined, {
      mode: 'aprofundar',
      helped: false,
      confidence: 0.7,
      sessionId: 's1',
    });
    expect(n.attempts[0]).toMatchObject({
      kind: 'write',
      mode: 'aprofundar',
      helped: false,
      confidence: 0.7,
      sessionId: 's1',
    });
  });
  it('tentativa antiga sem campos novos continua válida e helped vale false', () => {
    const parsed = workspaceSchema.parse(
      withAttempt({ at: 1, correct: true, kind: 'application', score: 1 }),
    );
    expect(parsed.concepts[0].attempts[0].helped).toBe(false);
  });
  it('acerto com ajuda não avança o intervalo', () => {
    const first = recordAnswer(base, true, 'write', 1, t0);
    expect(first.due).toBe(t0 + DAY);
    const second = recordAnswer(first, true, 'write', 1, t0 + DAY, undefined, { helped: true });
    expect(second.due).toBe(t0 + 2 * DAY);
  });
  it('confiança fora de 0..1 é recusada', () => {
    expect(() =>
      workspaceSchema.parse(
        withAttempt({ at: 1, correct: true, kind: 'write', score: 1, confidence: 1.5 }),
      ),
    ).toThrow();
  });
});
