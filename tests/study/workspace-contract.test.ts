import { describe, expect, it } from 'vitest';
import { emptyWorkspace, workspaceSchema, type Workspace } from '@/lib/study/domain';
import { mergeServerOwned, redactForClient } from '@/lib/study/workspace-contract';

const rubric = [
  { criterion: 'a', weight: 1 },
  { criterion: 'b', weight: 1 },
];
const png = 'data:image/png;base64,iVBORw0KGgo=';
const server = (): Workspace => ({
  ...emptyWorkspace(),
  concepts: [
    {
      id: 'c1',
      label: 'C',
      summary: '',
      note: '',
      origin: 'manual',
      courseIds: [],
      evidence: [],
      attempts: [],
      due: 0,
      exercises: [
        { type: 'escrita', id: 'w1', prompt: 'p', rubric, minChars: 0 },
        { type: 'desenho', id: 'd1', prompt: 'p', rubric },
      ],
    },
  ],
  submissions: [
    {
      id: 's1',
      conceptId: 'c1',
      exerciseId: 'w1',
      helped: false,
      createdAt: 1,
      answer: { type: 'escrita', text: 'minha resposta secreta' },
      state: 'pendente',
      tries: 1,
    },
    {
      id: 's2',
      conceptId: 'c1',
      exerciseId: 'd1',
      helped: false,
      createdAt: 2,
      answer: { type: 'desenho', image: png },
      state: 'pendente',
      tries: 0,
    },
  ],
  studySessions: [
    {
      id: 'p',
      mode: 'prova',
      state: 'ativa',
      startedAt: 1000,
      deadlineAt: 1000 + 600000,
      limitMinutes: 10,
      items: [{ conceptId: 'c1', exerciseId: 'w1', answeredAt: 1500 }],
    },
  ],
});

describe('contrato do workspace', () => {
  it('redactForClient apaga texto e imagem das respostas e mantém o resto', () => {
    const out = redactForClient(server());
    const raw = JSON.stringify(out);
    expect(raw).not.toContain('minha resposta secreta');
    expect(raw).not.toContain('iVBORw0KGgo');
    expect(out.submissions[0]).toMatchObject({ id: 's1', state: 'pendente', tries: 1 });
    expect(out.submissions[1].answer).toEqual({ type: 'desenho' });
    expect(out.studySessions).toEqual(server().studySessions);
  });
  it('mergeServerOwned ignora submissions e studySessions vindos do cliente', () => {
    const current = server();
    const tampered = {
      ...redactForClient(current),
      submissions: [],
      studySessions: [
        {
          ...current.studySessions[0],
          deadlineAt: 9e12,
          items: [{ conceptId: 'c1', exerciseId: 'w1' }],
        },
      ],
    };
    const merged = mergeServerOwned(tampered, current) as Workspace;
    expect(merged.studySessions).toEqual(current.studySessions);
    expect(merged.submissions).toEqual(current.submissions);
  });
  it('ida e volta GET→PUT não perde nem corrompe respostas guardadas', () => {
    const current = server();
    const merged = mergeServerOwned(redactForClient(current), current);
    const parsed = workspaceSchema.parse(merged);
    expect(parsed.submissions[0].answer).toEqual({
      type: 'escrita',
      text: 'minha resposta secreta',
    });
    expect(parsed.submissions[1].answer).toEqual({ type: 'desenho', image: png });
  });
  it('mergeServerOwned deixa passar entrada que não é objeto', () => {
    expect(mergeServerOwned(null, server())).toBeNull();
    expect(mergeServerOwned('x', server())).toBe('x');
    expect(mergeServerOwned([1], server())).toEqual([1]);
  });
});
