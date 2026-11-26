// Tipos da importação de cursos (etapa 5): o que cada leitor devolve e o que fica em disco.
import type { Course, LessonStatus } from '../domain';

export type { LessonStatus };
export type CourseOrigin = NonNullable<Course['origin']>;
export type Lesson = NonNullable<Course['lessons']>[number];

export type ImportSource = {
  id: string;
  kind: 'legenda' | 'documento' | 'video' | 'audio' | 'youtube';
  path?: string;
  url?: string;
  title: string;
  fingerprint: string;
  durationSeconds?: number;
  caption?: 'manual' | 'automatica';
};

export type DraftLesson = {
  title: string;
  sources: ImportSource[];
  minutes: number | null;
  /** Palavras do texto, para estimar a duração quando não há tempo conhecido. */
  words?: number;
  /** Estado inicial dado pelo leitor (por exemplo, 'sem-texto'); padrão 'importada'. */
  status?: LessonStatus;
};

export type ImportDraft = {
  title: string;
  origin: CourseOrigin;
  license?: string;
  importSource: string;
  lessons: DraftLesson[];
  ignored: string[];
};

export type Manifest = {
  sources: Record<string, ImportSource>;
  /** Pasta real de onde os caminhos relativos das fontes são lidos (pasta, ou zip extraído). */
  base?: string;
  /** Fontes de aulas que o dono removeu do roteiro (não voltam ao reimportar). */
  removedSourceIds?: string[];
  /** Estado da fila de "processar o resto" (Task 8). */
  queue?: unknown;
};
