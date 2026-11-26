import { expect, it, vi } from 'vitest';
import { createStudyContextReader } from '@/lib/study/context';
import { courseSchema, conceptSchema, emptyWorkspace } from '@/lib/study/domain';

const course = courseSchema.parse({
  id: 'course-a',
  title: 'Lógica',
  minutes: 30,
  deadline: null,
  hoursSource: 'estimate',
});
const node = conceptSchema.parse({
  id: 'concept-a',
  label: 'Conjunção',
  summary: 'As duas condições precisam ser verdadeiras.',
  note: 'Nota privada do estudo A.',
  origin: 'manual',
  courseIds: [course.id],
  evidence: [{ text: 'Exemplo da aula', start: 0, end: 2, mediaUrl: 'private://media' }],
  attempts: [],
  question: {
    question: 'P e Q?',
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 0,
    explanation: 'Resposta reservada ao quiz',
  },
});
const data = () => ({ ...emptyWorkspace(), courses: [course], concepts: [node] });

it('binds every read to the server owner and denies foreign and missing IDs identically', async () => {
  const read = vi.fn(async (owner: string) => ({
    revision: 2,
    data: owner === 'a' ? data() : emptyWorkspace(),
  }));
  const a = createStudyContextReader('a', read);
  const b = createStudyContextReader('b', read);
  expect((await a.getConcept({ conceptId: node.id })).concept.note).toBe(node.note);
  await expect(b.getConcept({ conceptId: node.id })).rejects.toMatchObject({
    status: 404,
    code: 'CONCEPT_NOT_FOUND',
  });
  await expect(b.getConcept({ conceptId: 'absent' })).rejects.toMatchObject({
    status: 404,
    code: 'CONCEPT_NOT_FOUND',
  });
  await expect(b.getCourse({ courseId: course.id })).rejects.toMatchObject({
    status: 404,
    code: 'COURSE_NOT_FOUND',
  });
  expect(read.mock.calls.map(([owner]) => owner)).toEqual(['a', 'b', 'b', 'b']);
});

it('rejects identity injection and excessive context requests before reading storage', async () => {
  const read = vi.fn(async () => ({ revision: 0, data: data() }));
  const reader = createStudyContextReader('a', read);
  await expect(reader.getConcept({ conceptId: node.id, ownerId: 'b' })).rejects.toThrow();
  await expect(reader.listCourses({ limit: 31 })).rejects.toThrow();
  await expect(reader.getPlan({ days: 8 })).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});

it('returns a bounded projection with provenance, excluding answer keys and media URLs', async () => {
  const state = data();
  state.concepts[0] = { ...node, summary: 'x'.repeat(9000), note: 'y'.repeat(8000) };
  const reader = createStudyContextReader('a', async () => ({ revision: 8, data: state }));
  const result = await reader.getConcept({ conceptId: node.id });
  expect(result).toMatchObject({ version: '1', source: 'study_workspace', revision: 8 });
  expect(result.concept.summary).toHaveLength(4000);
  expect(result.concept.note).toHaveLength(4000);
  expect(result.concept.contentTruncated).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/answerIndex|private:\/\/media|Resposta reservada/);
});

it('reads fresh data, preserves review priority, and does not infer mastery from reading', async () => {
  let revision = 0;
  const state = data();
  const reader = createStudyContextReader('a', async () => ({ revision, data: state }));
  expect((await reader.getConcept({ conceptId: node.id })).concept.progress.state).toBe('new');
  const now = Date.now();
  state.concepts[0] = {
    ...node,
    due: now - 1,
    attempts: [4, 2, 1].map((day) => ({
      at: now - day * 86400000,
      correct: true,
      helped: false,
      score: 1,
      kind: 'application' as const,
    })),
  };
  revision = 1;
  const result = await reader.getConcept({ conceptId: node.id });
  expect(result.revision).toBe(1);
  expect(result.concept.progress).toMatchObject({ state: 'review', mastered: true, attempts: 3, evidence: 3 });
  expect((await reader.getCourse({ courseId: course.id })).course.dueReviews).toBe(1);
});

it('paginates course discovery and handles an empty workspace', async () => {
  const state = data();
  state.courses.push({ ...course, id: 'course-b', title: 'Lógica avançada' });
  const reader = createStudyContextReader('a', async () => ({ revision: 0, data: state }));
  expect(await reader.listCourses({ query: 'LÓGICA', limit: 1 })).toMatchObject({
    total: 2,
    hasMore: true,
  });
  expect((await reader.listCourses({ offset: 1, limit: 1 })).courses[0].id).toBe('course-b');
  const empty = createStudyContextReader('b', async () => ({
    revision: 0,
    data: emptyWorkspace(),
  }));
  expect((await empty.listCourses({})).courses).toEqual([]);
  expect((await empty.getPlan({ days: 1 })).days).toHaveLength(1);
});
