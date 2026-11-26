// Arquivos de um curso importado no disco local: <studyRoot>/courses/<courseId>/.
// O texto extraído fica aqui, fora do JSON do workspace.
import fs from 'node:fs';
import path from 'node:path';
import type { Manifest } from './types';

const SAFE_ID = /^[A-Za-z0-9_-]{1,120}$/;
function safeId(id: string, what: string): string {
  if (!SAFE_ID.test(id)) throw new Error(`${what} inválido: ${JSON.stringify(id)}.`);
  return id;
}

export function courseFiles(root: string, courseId: string) {
  const dir = path.join(root, 'courses', safeId(courseId, 'Curso'));
  return {
    dir,
    manifest: path.join(dir, 'manifest.json'),
    zipDir: path.join(dir, 'zip'),
    text: (lessonId: string) => path.join(dir, 'text', `${safeId(lessonId, 'Aula')}.json`),
    result: (lessonId: string) => path.join(dir, 'results', `${safeId(lessonId, 'Aula')}.json`),
    /** Markdown convertido de um documento (MarkItDown), por fonte. */
    sourceText: (sourceId: string) => path.join(dir, 'sources', `${safeId(sourceId, 'Fonte')}.md`),
  };
}

export function readManifest(root: string, courseId: string): Manifest {
  const file = courseFiles(root, courseId).manifest;
  if (!fs.existsSync(file)) return { sources: {} };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Grava qualquer JSON com escrita atômica (arquivo .tmp e rename). */
export function writeJsonAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value));
  fs.renameSync(file + '.tmp', file);
}

export function writeManifest(root: string, courseId: string, manifest: Manifest) {
  writeJsonAtomic(courseFiles(root, courseId).manifest, manifest);
}
