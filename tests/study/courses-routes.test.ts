import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyWorkspace, type Workspace } from '@/lib/study/domain';
import { courseFiles } from '@/lib/study/courses/store';

const doubles = vi.hoisted(() => ({
  generate: vi.fn(),
  root: '',
  state: { revision: 1, data: null as unknown as Workspace },
}));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: async () => ({ revision: doubles.state.revision, data: doubles.state.data }),
  saveWorkspace: async (_o: string, revision: number, data: Workspace) => {
    if (revision !== doubles.state.revision) {
      const { AppError } = await import('@/lib/study/runtime/analysis');
      throw new AppError(409, 'REVISION_CONFLICT', 'Recarregue.');
    }
    doubles.state = { revision: revision + 1, data };
    return doubles.state;
  },
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({
    harness: 'codex',
    model: 'gpt-6-luna',
    generate: doubles.generate,
    root: doubles.root,
  }),
}));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    req: NextRequest,
    handler: (o: { ownerId: string }, h: Headers) => Promise<Response>,
  ) => handler({ ownerId: 'dono' }, new Headers()),
}));
import { POST } from '@/app/api/study/[...path]/route';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-course-routes-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const SRT = `1\n00:00:00,000 --> 00:02:00,000\nolá\n`;
let n = 0;
// GET, POST e PUT são a mesma função no route.ts: o método vai explícito.
const call = (method: 'GET' | 'POST' | 'PUT', route: string, body?: unknown) =>
  POST(
    new NextRequest(`http://127.0.0.1:3033/api/study/${route}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ path: route.split('?')[0].split('/') }) },
  );
const course = () => {
  const dir = path.join(tmp, `curso-${++n}`);
  fs.mkdirSync(dir);
  for (const name of ['1 A.srt', '2 B.srt', '3 C.srt']) fs.writeFileSync(path.join(dir, name), SRT);
  return dir;
};
const importOne = async () => {
  const res = await call('POST', 'course-import', {
    revision: doubles.state.revision,
    path: course(),
  });
  expect(res.status).toBe(200);
  return res.json();
};

beforeEach(() => {
  vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'true');
  doubles.state = { revision: 1, data: emptyWorkspace() };
  doubles.root = path.join(tmp, `dados-${++n}`);
});

describe('rotas de cursos importados', () => {
  it('course-import responde 403 sem GURIA_LOCAL', async () => {
    vi.stubEnv('OPENMAIC_STUDY_LOCAL', 'false');
    const res = await call('POST', 'course-import', { revision: 1, path: course() });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SO_MODO_LOCAL');
  });

  it('course-import devolve o workspace e o relatório', async () => {
    const out = await importOne();
    expect(out.revision).toBe(2);
    expect(out.data.courses[0].lessons).toHaveLength(3);
    expect(out.report.lessons).toBe(3);
  });

  it('course-tools informa o que está instalado', async () => {
    const res = await call('GET', 'course-tools');
    expect(Object.keys(await res.json()).sort()).toEqual(['markitdown', 'whisper', 'ytDlp']);
  });

  it('course-roadmap junta duas aulas', async () => {
    const out = await importOne();
    const c = out.data.courses[0];
    const [a, b, third] = c.lessons;
    const res = await call('PUT', 'course-roadmap', {
      revision: out.revision,
      courseId: c.id,
      lessons: [
        { id: third.id, title: 'Terceira primeiro', sourceIds: third.sourceIds },
        { id: a.id, title: 'A e B', sourceIds: [...a.sourceIds, ...b.sourceIds] },
      ],
    });
    expect(res.status).toBe(200);
    const lessons = (await res.json()).data.courses[0].lessons;
    expect(lessons.map((l: any) => [l.title, l.minutes])).toEqual([
      ['Terceira primeiro', 2],
      ['A e B', 4],
    ]);
  });

  it('course-roadmap recusa a mesma fonte em duas aulas', async () => {
    const out = await importOne();
    const c = out.data.courses[0];
    const [a, b] = c.lessons;
    const res = await call('PUT', 'course-roadmap', {
      revision: out.revision,
      courseId: c.id,
      lessons: [
        { id: a.id, title: a.title, sourceIds: a.sourceIds },
        { id: b.id, title: b.title, sourceIds: [...b.sourceIds, ...a.sourceIds] },
      ],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('FONTE_REPETIDA');
  });

  const aiAnswer = JSON.stringify({
    summary: 'Resumo da aula',
    concepts: [
      {
        id: 'ola',
        label: 'Saudação',
        summary: 'Como cumprimentar.',
        note: 'Olá',
        originalTerms: [],
        evidence: '[00:00] olá',
        startSeconds: 0,
        endSeconds: 2,
        exercises: [
          {
            type: 'escolha',
            prompt: 'Como se cumprimenta?',
            options: ['olá', 'tchau'],
            answerIndexes: [0],
            explanation: '',
            pairs: null,
            rubric: null,
          },
        ],
      },
    ],
    connections: [],
  });

  it('course-lesson-estimate soma os envios antes de processar', async () => {
    const out = await importOne();
    const c = out.data.courses[0];
    const res = await call('POST', 'course-lesson-estimate', {
      courseId: c.id,
      lessonIds: c.lessons.map((l: any) => l.id),
    });
    expect(await res.json()).toMatchObject({ envios: 3, transcricaoMinutos: 0, harness: 'codex' });
    expect(doubles.generate).not.toHaveBeenCalled();
  });

  it('process grava resultado em disco e status aguardando-revisao', async () => {
    doubles.generate.mockReset().mockResolvedValue(aiAnswer);
    const out = await importOne();
    const c = out.data.courses[0];
    const lesson = c.lessons[0];
    const res = await call('POST', 'course-lesson-process', {
      courseId: c.id,
      lessonId: lesson.id,
      harness: 'codex',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.courses[0].lessons[0].status).toBe('aguardando-revisao');
    expect(fs.existsSync(courseFiles(doubles.root, c.id).result(lesson.id))).toBe(true);
    expect(body.data.concepts).toEqual([]);
    const result = await (
      await call('GET', `course-lesson-result?courseId=${c.id}&lessonId=${lesson.id}`)
    ).json();
    expect(result.concepts[0].label).toBe('Saudação');
  });

  it('falha de cota deixa status falhou e não altera conceitos', async () => {
    doubles.generate
      .mockReset()
      .mockRejectedValue(Object.assign(new Error('quota'), { status: 429 }));
    const out = await importOne();
    const c = out.data.courses[0];
    const res = await call('POST', 'course-lesson-process', {
      courseId: c.id,
      lessonId: c.lessons[0].id,
    });
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('QUOTA_EXCEEDED');
    expect(doubles.state.data.courses[0].lessons![0].status).toBe('falhou');
    expect(doubles.state.data.concepts).toEqual([]);
  });

  it('approve leva os aprovados; com revisão velha dá REVISION_CONFLICT', async () => {
    doubles.generate.mockReset().mockResolvedValue(aiAnswer);
    const out = await importOne();
    const c = out.data.courses[0];
    const lessonId = c.lessons[0].id;
    await call('POST', 'course-lesson-process', { courseId: c.id, lessonId });
    const stale = await call('POST', 'course-lesson-approve', {
      revision: out.revision,
      courseId: c.id,
      lessonId,
      approvedIds: [`${lessonId}:ola`],
    });
    expect(stale.status).toBe(409);
    const ok = await call('POST', 'course-lesson-approve', {
      revision: doubles.state.revision,
      courseId: c.id,
      lessonId,
      approvedIds: [`${lessonId}:ola`],
      edits: [{ id: `${lessonId}:ola`, label: 'Cumprimentos', summary: 'Editado' }],
    });
    expect(ok.status).toBe(200);
    const data = (await ok.json()).data;
    expect(data.concepts.map((x: any) => [x.label, x.summary])).toEqual([
      ['Cumprimentos', 'Editado'],
    ]);
    expect(data.courses[0].lessons[0].status).toBe('processada');
  });

  it('process-rest exige confirmação e não roda duas filas do mesmo curso', async () => {
    let release: () => void = () => {};
    doubles.generate
      .mockReset()
      .mockImplementation(() => new Promise((resolve) => (release = () => resolve(aiAnswer))));
    const out = await importOne();
    const courseId = out.data.courses[0].id;
    expect((await call('POST', 'course-process-rest', { courseId })).status).toBe(400);
    const first = await call('POST', 'course-process-rest', { courseId, confirmed: true });
    expect(first.status).toBe(202);
    expect((await first.json()).queue.lessonIds).toHaveLength(3);
    const second = await call('POST', 'course-process-rest', { courseId, confirmed: true });
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe('FILA_ATIVA');
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(doubles.generate).toHaveBeenCalledTimes(i + 1));
      release();
    }
    await vi.waitFor(async () => {
      const q = await (await call('GET', `course-queue?courseId=${courseId}`)).json();
      expect(q).toMatchObject({ running: false, done: expect.arrayContaining([]) });
      expect(q.done).toHaveLength(3);
    });
  });

  it('dois cliques em processar o resto ao mesmo tempo: só uma fila (revisão final I4)', async () => {
    let release: () => void = () => {};
    doubles.generate
      .mockReset()
      .mockImplementation(() => new Promise((resolve) => (release = () => resolve(aiAnswer))));
    const out = await importOne();
    const courseId = out.data.courses[0].id;
    const [a, b] = await Promise.all([
      call('POST', 'course-process-rest', { courseId, confirmed: true }),
      call('POST', 'course-process-rest', { courseId, confirmed: true }),
    ]);
    expect([a.status, b.status].sort()).toEqual([202, 409]);
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(doubles.generate).toHaveBeenCalledTimes(i + 1));
      release();
    }
    await vi.waitFor(async () => {
      const q = await (await call('GET', `course-queue?courseId=${courseId}`)).json();
      expect(q.running).toBe(false);
    });
    expect(doubles.generate).toHaveBeenCalledTimes(3);
  });

  it('aula removida no roteiro continua fora depois de reimportar (revisão final I3)', async () => {
    const dir = course();
    const first = await (
      await call('POST', 'course-import', { revision: doubles.state.revision, path: dir })
    ).json();
    const c = first.data.courses[0];
    const [a, b] = c.lessons;
    await call('PUT', 'course-roadmap', {
      revision: first.revision,
      courseId: c.id,
      lessons: [a, b].map((l: any) => ({ id: l.id, title: l.title, sourceIds: l.sourceIds })),
    });
    const again = await (
      await call('POST', 'course-import', { revision: doubles.state.revision, path: dir })
    ).json();
    expect(again.data.courses[0].lessons).toHaveLength(2);
    expect(again.report.added).toBe(0);
  });
});
