import { z } from 'zod';
import { mastery, type Concept, type Workspace } from './domain';
import { graphStatus } from './graph-status';
import { courseProgress, planStudy } from './planner';
import { AppError } from './runtime/analysis';

const idSchema = z.string().trim().min(1).max(200);
const timestamp = z.number().nonnegative();
const metadata = {
  version: z.literal('1'),
  source: z.literal('study_workspace'),
  revision: z.number().int().nonnegative(),
  generatedAt: z.iso.datetime(),
};
export const progressSchema = z.object({
  state: z.enum(['new', 'learning', 'review', 'mastered']),
  mastered: z.boolean(),
  correctDays: z.number().int().nonnegative(),
  accuracy: z.number().min(0).max(1),
  attempts: z.number().int().nonnegative(),
  evidence: z.number().int().nonnegative(),
  due: timestamp.nullable(),
});
const conceptSummarySchema = z.object({
  id: idSchema,
  label: z.string().max(160),
  progress: progressSchema,
});
const courseSummarySchema = z.object({
  id: idSchema,
  title: z.string().max(200),
  learningType: z.enum(['course', 'free']),
  estimatedMinutes: z.number().nonnegative().nullable(),
  completedMinutes: z.number().nonnegative(),
  concepts: z.number().int().nonnegative(),
  dueReviews: z.number().int().nonnegative(),
  deadline: z.iso.date().nullable(),
});
export const courseListInput = z
  .object({
    query: z.string().trim().max(200).default(''),
    offset: z.number().int().min(0).max(5000).default(0),
    limit: z.number().int().min(1).max(30).default(20),
  })
  .strict();
export const courseInput = z.object({ courseId: idSchema }).strict();
export const conceptInput = z.object({ conceptId: idSchema }).strict();
export const planInput = z
  .object({
    days: z.number().int().min(1).max(7).default(3),
  })
  .strict();
export const courseListOutput = z.object({
  ...metadata,
  courses: z.array(courseSummarySchema).max(30),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export const courseOutput = z.object({
  ...metadata,
  course: courseSummarySchema,
  concepts: z.array(conceptSummarySchema).max(50),
  connections: z
    .array(z.object({ source: idSchema, target: idSchema, relation: z.string().max(200) }))
    .max(80),
  contentTruncated: z.boolean(),
});
export const conceptOutput = z.object({
  ...metadata,
  concept: conceptSummarySchema.extend({
    summary: z.string().max(4000),
    note: z.string().max(4000),
    origin: z.enum(['lesson', 'manual', 'ai']),
    evidence: z
      .array(
        z.object({
          text: z.string().max(500),
          start: timestamp,
          end: timestamp,
        }),
      )
      .max(5),
    contentTruncated: z.boolean(),
  }),
  related: z.array(conceptSummarySchema).max(8),
});
export const planOutput = z.object({
  ...metadata,
  days: z
    .array(
      z.object({
        date: z.iso.date(),
        limit: z.number().nonnegative(),
        logged: z.number().nonnegative(),
        breaks: z.number().nonnegative(),
        items: z
          .array(
            z.object({
              courseId: z.string(),
              title: z.string().max(500),
              kind: z.enum(['lesson', 'practice', 'review']),
              minutes: z.number().nonnegative(),
              reason: z.string().max(500),
            }),
          )
          .max(20),
      }),
    )
    .max(7),
  contentTruncated: z.boolean(),
});

export type StudySnapshot = { revision: number; data: Workspace };
export type WorkspaceReader = (owner: string) => Promise<StudySnapshot>;

/** The authenticated owner is bound by the route, never by a model's arguments. */
export function createStudyContextReader(owner: string, read: WorkspaceReader) {
  const progress = (node: Concept, now: Date) => {
    const result = mastery(node);
    return {
      state: graphStatus(node, now.getTime()),
      mastered: result.mastered,
      correctDays: result.days,
      accuracy: result.accuracy,
      attempts: node.attempts.length,
      evidence: result.evidenceCount,
      due: node.due > 0 ? node.due : null,
    };
  };
  const summarize = (node: Concept, now: Date) => ({
    id: node.id,
    label: node.label,
    progress: progress(node, now),
  });
  const snapshot = async () => {
    const value = await read(owner);
    const now = new Date();
    return {
      ...value,
      now,
      meta: {
        version: '1' as const,
        source: 'study_workspace' as const,
        revision: value.revision,
        generatedAt: now.toISOString(),
      },
    };
  };
  const summarizeCourse = (data: Workspace, course: Workspace['courses'][number], now: Date) => {
    const nodes = data.concepts.filter((node) => node.courseIds.includes(course.id));
    return {
      id: course.id,
      title: course.title,
      learningType: course.learningType || 'course',
      estimatedMinutes:
        course.minutes === null
          ? null
          : course.minutes + course.practiceMinutes + course.reviewMinutes,
      completedMinutes: courseProgress(data, course),
      concepts: nodes.length,
      dueReviews: nodes.filter((node) => graphStatus(node, now.getTime()) === 'review').length,
      deadline: course.deadline,
    };
  };
  return {
    async listCourses(raw: unknown) {
      const input = courseListInput.parse(raw);
      const { data, meta, now } = await snapshot();
      const matches = data.courses.filter((course) =>
        course.title.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()),
      );
      return courseListOutput.parse({
        ...meta,
        courses: matches
          .slice(input.offset, input.offset + input.limit)
          .map((course) => summarizeCourse(data, course, now)),
        total: matches.length,
        hasMore: input.offset + input.limit < matches.length,
      });
    },
    async getCourse(raw: unknown) {
      const { courseId } = courseInput.parse(raw);
      const { data, meta, now } = await snapshot();
      const course = data.courses.find((course) => course.id === courseId);
      if (!course) throw new AppError(404, 'COURSE_NOT_FOUND', 'Curso não encontrado.');
      const nodes = data.concepts.filter((node) => node.courseIds.includes(courseId));
      const selected = nodes.slice(0, 50);
      const ids = new Set(selected.map((node) => node.id));
      const links = data.connections.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
      return courseOutput.parse({
        ...meta,
        course: summarizeCourse(data, course, now),
        concepts: selected.map((node) => summarize(node, now)),
        connections: links.slice(0, 80).map(({ source, target, relation }) => ({
          source,
          target,
          relation: relation.slice(0, 200),
        })),
        contentTruncated:
          nodes.length > 50 ||
          links.length > 80 ||
          links.slice(0, 80).some((edge) => edge.relation.length > 200),
      });
    },
    async getConcept(raw: unknown) {
      const { conceptId } = conceptInput.parse(raw);
      const { data, meta, now } = await snapshot();
      const node = data.concepts.find((node) => node.id === conceptId);
      if (!node) throw new AppError(404, 'CONCEPT_NOT_FOUND', 'Conceito não encontrado.');
      const relatedIds = new Set(
        data.connections
          .filter((edge) => edge.source === node.id || edge.target === node.id)
          .map((edge) => (edge.source === node.id ? edge.target : edge.source)),
      );
      const related = data.concepts.filter((candidate) => relatedIds.has(candidate.id));
      return conceptOutput.parse({
        ...meta,
        concept: {
          ...summarize(node, now),
          summary: node.summary.slice(0, 4000),
          note: node.note.slice(0, 4000),
          origin: node.origin,
          evidence: node.evidence
            .slice(0, 5)
            .map(({ text, start, end }) => ({ text: text.slice(0, 500), start, end })),
          contentTruncated:
            node.summary.length > 4000 ||
            node.note.length > 4000 ||
            node.evidence.length > 5 ||
            node.evidence.slice(0, 5).some((item) => item.text.length > 500) ||
            related.length > 8,
        },
        related: related.slice(0, 8).map((candidate) => summarize(candidate, now)),
      });
    },
    async getPlan(raw: unknown) {
      const { days } = planInput.parse(raw);
      const { data, meta, now } = await snapshot();
      const plan = planStudy(data, now);
      return planOutput.parse({
        ...meta,
        days: plan.days.slice(0, days).map((day) => ({
          date: day.date,
          limit: day.limit,
          logged: day.logged,
          breaks: day.breaks,
          items: day.items.slice(0, 20).map(({ courseId, title, kind, minutes, reason }) => ({
            courseId,
            title: title.slice(0, 500),
            kind,
            minutes,
            reason: reason.slice(0, 500),
          })),
        })),
        contentTruncated:
          plan.days.length > days || plan.days.slice(0, days).some((day) => day.items.length > 20),
      });
    },
  };
}
export type StudyContextReader = ReturnType<typeof createStudyContextReader>;
