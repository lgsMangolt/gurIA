import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { conceptSchema, emptyWorkspace, type Workspace } from '@/lib/study/domain';
import { reminderSummaryPath, reviewDueDates, writeReviewSummary } from '@/lib/study/reminder';

const attempt = { at: 1, correct: true, kind: 'choice', score: 1 };
const question = {
  question: 'Qual?',
  options: ['a', 'b', 'c', 'd'],
  answerIndex: 0,
  explanation: '',
};
const concept = (id: string, over: Record<string, unknown> = {}) =>
  conceptSchema.parse({
    id,
    label: 'Segredo ' + id,
    summary: 'texto de estudo',
    note: '',
    courseIds: [],
    origin: 'manual',
    evidence: [],
    attempts: [attempt],
    question,
    ...over,
  });
const workspace = (concepts: ReturnType<typeof concept>[]): Workspace => ({
  ...emptyWorkspace(),
  concepts,
});

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('resumo das revisões', () => {
  it('lista um vencimento por conceito praticado com exercício, em ordem', () => {
    const w = workspace([concept('b', { due: 300 }), concept('a', { due: 100 })]);
    expect(reviewDueDates(w)).toEqual([100, 300]);
  });

  it('ignora conceito nunca praticado (due 0, sem tentativas)', () => {
    const w = workspace([concept('novo', { attempts: [], due: 0 }), concept('x', { due: 50 })]);
    expect(reviewDueDates(w)).toEqual([50]);
  });

  it('ignora conceito sem exercício', () => {
    const w = workspace([concept('sem', { question: undefined, due: 10 })]);
    expect(reviewDueDates(w)).toEqual([]);
  });

  it('grava só datas, sem nomes nem textos de estudo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-lembrete-'));
    dirs.push(root);
    writeReviewSummary(root, workspace([concept('a', { due: 100 })]), 999);
    const raw = fs.readFileSync(reminderSummaryPath(root), 'utf8');
    expect(JSON.parse(raw)).toEqual({ versao: 1, atualizado: 999, vencimentos: [100] });
    expect(raw).not.toMatch(/Segredo|texto de estudo/);
    expect(fs.readdirSync(root)).toEqual(['lembrete-revisoes.json']);
  });
});
