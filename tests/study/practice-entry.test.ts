import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { conceptSchema, emptyWorkspace, workspaceSchema, type Workspace } from '@/lib/study/domain';
import { lessonPracticeTarget, normalizeEntry, reviewTarget } from '@/lib/study/ui/navigation';

const doubles = vi.hoisted(() => ({
  state: { revision: 1, data: null as unknown as Workspace },
  saved: 0,
}));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: async () => ({ revision: doubles.state.revision, data: doubles.state.data }),
  saveWorkspace: async (_owner: string, revision: number, raw: unknown) => {
    if (revision !== doubles.state.revision) throw new Error('revisão inesperada');
    doubles.state.data = workspaceSchema.parse(raw);
    doubles.state.revision++;
    doubles.saved++;
    return { revision: doubles.state.revision, data: doubles.state.data };
  },
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({ harness: 'codex', model: 'gpt-6-luna', generate: vi.fn() }),
}));
vi.mock('@/lib/study/runtime/media', () => ({ localReady: () => true }));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    req: NextRequest,
    handler: (owner: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => handler({ ownerId: req.headers.get('x-test-owner') || 'owner-a' }, new Headers()),
}));
import { POST } from '@/app/api/study/[...path]/route';

const root = path.resolve(__dirname, '..', '..');
const concept = (id: string, over: Record<string, unknown> = {}) =>
  conceptSchema.parse({
    id,
    label: 'Conceito ' + id,
    summary: '',
    note: '',
    courseIds: ['c1'],
    origin: 'manual',
    evidence: [],
    attempts: [],
    question: { question: 'Qual?', options: ['a', 'b', 'c', 'd'], answerIndex: 0, explanation: '' },
    ...over,
  });

function call(route: string, body: unknown) {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req, { params: Promise.resolve({ path: [route] }) });
}

beforeEach(() => {
  doubles.state = { revision: 1, data: emptyWorkspace() };
  doubles.saved = 0;
});

describe('navegação', () => {
  const entry = (screen: Record<string, unknown>) => ({ session: 's', index: 0, screen });

  it('entradas antigas da Biblioteca ou do player viram a aba Praticar', () => {
    expect(
      normalizeEntry(entry({ tab: 'library', reading: '', course: '', practice: null }))?.screen,
    ).toEqual({ tab: 'praticar', reading: '', course: '' });
    expect(
      normalizeEntry(
        entry({
          tab: 'courses',
          reading: '',
          course: 'c1',
          practice: { stageId: 'stage-1', title: 'Aula' },
        }),
      )?.screen,
    ).toEqual({ tab: 'praticar', reading: '', course: 'c1' });
  });

  it('as abas de hoje continuam válidas e lixo é recusado', () => {
    for (const tab of [
      'studies',
      'chat',
      'network',
      'materials',
      'courses',
      'praticar',
      'skills',
      'entrevista',
      'plan',
      'settings',
    ])
      expect(normalizeEntry(entry({ tab, reading: 'r', course: '' }))?.screen.tab).toBe(tab);
    expect(normalizeEntry(entry({ tab: 'inexistente', reading: '', course: '' }))).toBeNull();
    expect(normalizeEntry(null)).toBeNull();
    expect(
      normalizeEntry({
        session: 's',
        index: -1,
        screen: { tab: 'studies', reading: '', course: '' },
      }),
    ).toBeNull();
  });
});

describe('Revisar abre o Praticar', () => {
  const now = 1_000_000;
  it('conceitos vencidos vão para a Revisão espaçada, só eles', () => {
    const due = concept('a', { due: now - 1 });
    const later = concept('b', { due: now + 1 });
    expect(reviewTarget([due, later], now)).toEqual({ mode: 'revisao', conceptIds: ['a'] });
  });

  it('sem nada vencido, abre o Rápido com os conceitos que têm exercício', () => {
    const later = concept('b', { due: now + 1 });
    const empty = concept('c', { question: undefined, due: 0 });
    expect(reviewTarget([later, empty], now)).toEqual({ mode: 'rapido', conceptIds: ['b'] });
  });

  it('sem exercício nenhum não há o que praticar', () => {
    expect(reviewTarget([concept('c', { question: undefined })], now)).toBeNull();
    expect(reviewTarget([], now)).toBeNull();
  });
});

describe('rotas do player antigo', () => {
  it('classroom e classroom-result não existem', async () => {
    expect((await call('classroom', { courseId: 'c1' })).status).toBe(404);
    expect(
      (await call('classroom-result', { stageId: 's', sceneId: 'x', attemptId: 'a', answers: [] }))
        .status,
    ).toBe(404);
  });

  it('criar um curso só grava o workspace', async () => {
    const res = await call('courses', {
      revision: 1,
      course: { id: 'x', title: 'Curso novo', minutes: 60, deadline: null, hoursSource: 'unknown' },
    });
    expect(res.status).toBe(201);
    expect(doubles.saved).toBe(1);
    expect(doubles.state.data.courses.map((c) => c.title)).toEqual(['Curso novo']);
  });
});

describe('código e textos', () => {
  it('tsconfig.study.json não inclui o quiz-view do OpenMAIC', () => {
    expect(fs.readFileSync(path.join(root, 'tsconfig.study.json'), 'utf8')).not.toContain(
      'quiz-view',
    );
  });

  it('o guia não cita player nem Biblioteca e diz que os quizzes antigos viraram exercícios', () => {
    const guide = fs.readFileSync(path.join(root, 'docs', 'guia', 'estudos.md'), 'utf8');
    expect(guide).not.toMatch(/player|Biblioteca|área Pro/i);
    expect(guide).toMatch(/quizzes antigos/i);
    expect(guide).toMatch(/exercícios/);
  });
});

describe('Praticar depois de aprovar uma aula importada', () => {
  it('abre o Rápido com os conceitos da aula que têm exercício, mesmo os recém-aprovados (due 0)', () => {
    const a = concept('L1:a', { due: 0 });
    const b = concept('L1:b', { due: 0 });
    const outra = concept('L2:c', { due: 0 });
    expect(lessonPracticeTarget([a, b, outra], 'L1')).toEqual({
      mode: 'rapido',
      conceptIds: ['L1:a', 'L1:b'],
      minutes: 3,
    });
  });

  it('ignora conceitos sem exercício e devolve null quando não sobra nenhum', () => {
    const vazio = concept('L1:x', { question: undefined });
    expect(lessonPracticeTarget([vazio], 'L1')).toBeNull();
    expect(lessonPracticeTarget([], 'L1')).toBeNull();
  });

  it('não confunde a aula L1 com a L10', () => {
    expect(lessonPracticeTarget([concept('L10:a')], 'L1')).toBeNull();
  });

  it('cerca de 1 minuto por conceito, no mínimo 3', () => {
    const cinco = ['a', 'b', 'c', 'd', 'e'].map((x) => concept(`L1:${x}`));
    expect(lessonPracticeTarget(cinco, 'L1')?.minutes).toBe(5);
  });
});
