import { describe, expect, it } from 'vitest';
import { emptyWorkspace, type Concept, type Workspace } from '@/lib/study/domain';
import type { Exercise } from '@/lib/study/exercises/schema';
import { ESTIMATE_MINUTES, MAX_ITEMS, RAPIDO_MAX_MINUTES } from '@/lib/study/sessions/session';
import { MODE_FORMATS, selectItems } from '@/lib/study/sessions/select';

const NOW = new Date(2026, 10, 10, 12).getTime();
const DAY = 86400000;
const rubric = [
  { criterion: 'a', weight: 1 },
  { criterion: 'b', weight: 1 },
];
const ex = (type: Exercise['type'], id: string): Exercise => {
  switch (type) {
    case 'escolha':
      return { type, id, prompt: 'p', options: ['a', 'b'], answerIndexes: [0], explanation: '' };
    case 'ligar':
      return {
        type,
        id,
        prompt: 'p',
        pairs: [
          { left: 'a', right: '1' },
          { left: 'b', right: '2' },
        ],
      };
    case 'desenho':
      return { type, id, prompt: 'p', rubric };
    default:
      return { type: 'escrita', id, prompt: 'p', rubric, minChars: 0 };
  }
};
type Att = Concept['attempts'][number];
const att = (kind: Att['kind'], correct = true, at = NOW - 5 * DAY): Att => ({
  at,
  correct,
  kind,
  score: Number(correct),
  helped: false,
});
const concept = (id: string, over: Partial<Concept> = {}): Concept => ({
  id,
  label: id,
  summary: '',
  note: '',
  origin: 'manual',
  courseIds: [],
  evidence: [],
  attempts: [att('choice')],
  due: NOW - DAY,
  exercises: [
    ex('escolha', id + '-e'),
    ex('ligar', id + '-l'),
    ex('desenho', id + '-d'),
    ex('escrita', id + '-w'),
  ],
  ...over,
});
const ws = (concepts: Concept[]): Workspace => ({ ...emptyWorkspace(), concepts });
const typeOf = (w: Workspace, item: { conceptId: string; exerciseId: string }) =>
  w.concepts.find((c) => c.id === item.conceptId)!.exercises.find((e) => e.id === item.exerciseId)!
    .type;
const code = (c: string) => expect.objectContaining({ code: c });

describe('seleção por modo', () => {
  it('rapido usa só escolha e ligar, respeita 10 itens e 20 minutos', () => {
    const w = ws(Array.from({ length: 12 }, (_, i) => concept('c' + String(i).padStart(2, '0'))));
    const { items } = selectItems(w, { mode: 'rapido', now: NOW });
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS.rapido);
    expect(new Set(items.map((i) => i.conceptId)).size).toBe(items.length);
    const types = items.map((i) => typeOf(w, i));
    expect(types.every((t) => MODE_FORMATS.rapido.includes(t))).toBe(true);
    const minutes = types.reduce((sum, t) => sum + ESTIMATE_MINUTES[t], 0);
    expect(minutes).toBeLessThanOrEqual(RAPIDO_MAX_MINUTES);
  });
  it('aprofundar usa desenho, ligar e escrita, prefere conceitos com menos evidências e dá até 2 exercícios de tipos diferentes', () => {
    const proven = concept('a-proven', {
      attempts: [att('write'), att('write', true, NOW - 3 * DAY)],
    });
    const fresh = concept('b-fresh');
    const w = ws([proven, fresh]);
    const { items } = selectItems(w, { mode: 'aprofundar', now: NOW });
    expect(items[0].conceptId).toBe('b-fresh');
    const mine = items.filter((i) => i.conceptId === 'b-fresh');
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((i) => typeOf(w, i))).size).toBe(2);
    expect(items.every((i) => MODE_FORMATS.aprofundar.includes(typeOf(w, i)))).toBe(true);
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS.aprofundar);
  });
  it('prova exige conceptIds (1 a 10), usa só escolha e escrita e calcula limitMinutes', () => {
    const many = Array.from({ length: 11 }, (_, i) => concept('p' + String(i).padStart(2, '0')));
    const w = ws(many);
    expect(() => selectItems(w, { mode: 'prova', now: NOW })).toThrow(code('PROVA_SEM_CONCEITOS'));
    expect(() =>
      selectItems(w, { mode: 'prova', conceptIds: many.map((c) => c.id), now: NOW }),
    ).toThrow(code('PROVA_SEM_CONCEITOS'));
    const ten = selectItems(w, {
      mode: 'prova',
      conceptIds: many.slice(0, 10).map((c) => c.id),
      now: NOW,
    });
    expect(ten.items).toHaveLength(10);
    expect(ten.items.every((i) => MODE_FORMATS.prova.includes(typeOf(w, i)))).toBe(true);
    expect(ten.limitMinutes).toBe(50);
    const onlyChoice = ws([concept('z', { exercises: [ex('escolha', 'z-e')] })]);
    expect(
      selectItems(onlyChoice, { mode: 'prova', conceptIds: ['z'], now: NOW }).limitMinutes,
    ).toBe(10);
  });
  it('revisao só traz conceitos vencidos ou com último erro e prefere escolha', () => {
    const due = concept('due');
    const wrong = concept('wrong', { due: NOW + 9 * DAY, attempts: [att('choice', false)] });
    const fine = concept('fine', { due: NOW + 9 * DAY });
    const w = ws([due, wrong, fine]);
    const { items } = selectItems(w, { mode: 'revisao', now: NOW });
    expect(items.map((i) => i.conceptId).sort()).toEqual(['due', 'wrong']);
    expect(items.every((i) => typeOf(w, i) === 'escolha')).toBe(true);
    const noChoice = ws([concept('w', { exercises: [ex('escrita', 'w-w')] })]);
    expect(typeOf(noChoice, selectItems(noChoice, { mode: 'revisao', now: NOW }).items[0])).toBe(
      'escrita',
    );
  });
  it('erro recente vem antes de vencido, e vencido mais atrasado vem antes (empate por id)', () => {
    const w = ws([
      concept('d-late', { due: NOW - 5 * DAY }),
      concept('d-soon', { due: NOW - 1 * DAY }),
      concept('a-err', { due: NOW + 3 * DAY, attempts: [att('choice', false)] }),
      concept('b-tie-1', { due: NOW - 1 * DAY }),
    ]);
    const order = selectItems(w, { mode: 'revisao', now: NOW }).items.map((i) => i.conceptId);
    expect(order).toEqual(['a-err', 'd-late', 'b-tie-1', 'd-soon']);
  });
  it('sem exercício elegível lança SEM_EXERCICIOS com mensagem do modo', () => {
    const noEx = ws([concept('n', { exercises: [] })]);
    for (const mode of ['rapido', 'aprofundar', 'revisao'] as const)
      expect(() => selectItems(noEx, { mode, now: NOW })).toThrow(code('SEM_EXERCICIOS'));
    expect(() => selectItems(noEx, { mode: 'prova', conceptIds: ['n'], now: NOW })).toThrow(
      code('SEM_EXERCICIOS'),
    );
    const onlyDraw = ws([concept('o', { exercises: [ex('desenho', 'o-d')] })]);
    expect(() => selectItems(onlyDraw, { mode: 'rapido', now: NOW })).toThrow(/escolha|ligar/i);
    const legacy = ws([
      concept('l', {
        exercises: [],
        question: { question: 'q', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: '' },
      }),
    ]);
    expect(selectItems(legacy, { mode: 'rapido', now: NOW }).items).toHaveLength(1);
  });
  it('conceptIds inexistente lança 404', () => {
    expect(() =>
      selectItems(ws([concept('a')]), { mode: 'rapido', conceptIds: ['x'], now: NOW }),
    ).toThrow(expect.objectContaining({ status: 404 }));
  });
  it('a rotação não repete sempre o mesmo exercício do conceito', () => {
    const two = (attempts: Att[]) =>
      ws([concept('r', { exercises: [ex('escolha', 'r1'), ex('escolha', 'r2')], attempts })]);
    const first = selectItems(two([]), { mode: 'rapido', conceptIds: ['r'], now: NOW }).items[0];
    const second = selectItems(two([att('choice')]), { mode: 'rapido', now: NOW }).items[0];
    expect(first.exerciseId).toBe('r1');
    expect(second.exerciseId).toBe('r2');
  });
  it('um conceito sem tentativas só entra quando é escolhido', () => {
    const w = ws([concept('new', { attempts: [], due: 0 })]);
    expect(() => selectItems(w, { mode: 'rapido', now: NOW })).toThrow(code('SEM_EXERCICIOS'));
    expect(selectItems(w, { mode: 'rapido', conceptIds: ['new'], now: NOW }).items).toHaveLength(1);
  });
});
