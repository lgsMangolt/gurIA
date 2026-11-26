// Processar uma aula: lê o texto, chama a IA escolhida, guarda o resultado pendente em
// disco e marca a aula. Nada entra na rede sem a aprovação do dono (course-lesson-approve).
import fs from 'node:fs';
import type { Workspace } from '../domain';
import { AppError } from '../runtime/analysis';
import { analyzeLesson, type LessonResult } from './lesson-analysis';
import { loadLessonText } from './lesson-text';
import { courseFiles, readManifest, writeJsonAtomic } from './store';
import type { Lesson, LessonStatus } from './types';

export type WorkspaceDeps = {
  readWorkspace(owner: string): Promise<{ revision: number; data: Workspace }>;
  saveWorkspace(
    owner: string,
    revision: number,
    data: Workspace,
  ): Promise<{ revision: number; data: Workspace }>;
};
type GenerateFn = (prompt: string, schema: unknown) => Promise<string>;

/** Altera uma aula no workspace mais recente, repetindo se outra aba salvou no meio. */
export async function updateLesson(
  owner: string,
  courseId: string,
  lessonId: string,
  patch: Partial<Lesson>,
  deps: WorkspaceDeps,
): Promise<{ revision: number; data: Workspace }> {
  for (let attempt = 0; ; attempt++) {
    const snapshot = await deps.readWorkspace(owner);
    const data = {
      ...snapshot.data,
      courses: snapshot.data.courses.map((c) =>
        c.id !== courseId
          ? c
          : {
              ...c,
              lessons: (c.lessons ?? []).map((l) => (l.id === lessonId ? { ...l, ...patch } : l)),
            },
      ),
    };
    try {
      return await deps.saveWorkspace(owner, snapshot.revision, data);
    } catch (e) {
      if (!(e instanceof AppError && e.code === 'REVISION_CONFLICT') || attempt >= 2) throw e;
    }
  }
}

const statusFor = (e: unknown): LessonStatus =>
  e instanceof AppError && e.code === 'TEXTO_AUSENTE'
    ? 'texto-ausente'
    : e instanceof AppError && e.code === 'FONTE_AUSENTE'
      ? 'fonte-ausente'
      : e instanceof AppError && e.code === 'SEM_TEXTO'
        ? 'sem-texto'
        : 'falhou';

export async function processLesson(
  args: { root: string; owner: string; courseId: string; lessonId: string; generate: GenerateFn },
  deps: WorkspaceDeps,
): Promise<{ revision: number; data: Workspace }> {
  const { data } = await deps.readWorkspace(args.owner);
  const course = data.courses.find((c) => c.id === args.courseId);
  const lesson = course?.lessons?.find((l) => l.id === args.lessonId);
  if (!course || !lesson) throw new AppError(404, 'AULA_AUSENTE', 'Aula não encontrada.');
  try {
    const text = await loadLessonText(
      args.root,
      course.id,
      lesson,
      readManifest(args.root, course.id),
    );
    const result = await analyzeLesson(
      text,
      {
        courseTitle: course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        currentContext: data.concepts.map((c) => c.label).join('; '),
      },
      args.generate,
    );
    writeJsonAtomic(courseFiles(args.root, course.id).result(lesson.id), result);
  } catch (e) {
    await updateLesson(args.owner, course.id, lesson.id, { status: statusFor(e) }, deps);
    throw e;
  }
  return updateLesson(args.owner, course.id, lesson.id, { status: 'aguardando-revisao' }, deps);
}

export function readLessonResult(root: string, courseId: string, lessonId: string): LessonResult {
  const file = courseFiles(root, courseId).result(lessonId);
  if (!fs.existsSync(file))
    throw new AppError(404, 'RESULTADO_AUSENTE', 'Esta aula ainda não foi processada.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
