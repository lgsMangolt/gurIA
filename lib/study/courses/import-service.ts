// Importar um curso: lê a fonte (pasta, arquivos, zip ou pacote OCW), converte os
// documentos, funde no curso existente e salva. Nunca chama IA.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Workspace } from '../domain';
import { AppError } from '../runtime/analysis';
import type { convertDocument as ConvertDocument } from './markitdown';
import { mergeImport } from './merge';
import { readYoutube as ReadYoutube } from './read-youtube';
import { isOcwPackage, readOcw } from './read-ocw';
import { readFolder } from './read-folder';
import { extractZip } from './read-zip';
import { courseFiles, readManifest, writeManifest } from './store';
import type { ImportDraft, LessonStatus, Manifest } from './types';

export type ImportDeps = {
  readWorkspace(owner: string): Promise<{ revision: number; data: Workspace }>;
  saveWorkspace(
    owner: string,
    revision: number,
    data: Workspace,
  ): Promise<{ revision: number; data: Workspace }>;
  convertDocument: typeof ConvertDocument;
  /** Curso com fila de processamento rodando: não pode ser reimportado agora. */
  isBusy?: (courseId: string) => boolean;
  /** Troca o leitor do YouTube nos testes; padrão: yt-dlp de verdade. */
  readYoutube?: typeof ReadYoutube;
};

export type ImportReport = {
  lessons: number;
  added: number;
  missing: number;
  ignored: string[];
  scanned: number;
  converterMissing: number;
  failedDocuments: number;
};

type Converted = { markdown: string | null; words: number; scanned: boolean; missing: boolean };
/** Estados que a reimportação pode atualizar (a aula ainda não foi processada). */
const UNPROCESSED: LessonStatus[] = [
  'importada',
  'sem-texto',
  'escaneado',
  'precisa-transcrever',
  'texto-ausente',
];

/** Chave de arquivos soltos: os próprios arquivos, não a pasta (que pode ser outro curso). */
const filesKey = (files: string[]) =>
  `arquivos:${createHash('sha256')
    .update([...files].sort().join('|'))
    .digest('hex')
    .slice(0, 32)}`;

async function readSource(
  root: string,
  input: { path?: string; files?: string[]; url?: string },
  readYoutube: typeof ReadYoutube,
): Promise<{ draft: ImportDraft; base: string; tmpZip?: string }> {
  if (input.url) {
    // As legendas baixadas ficam numa pasta temporária e depois vão para a pasta do curso.
    const tmpZip = path.join(root, 'courses', `_tmp-${randomUUID()}`);
    try {
      return { draft: await readYoutube(input.url, tmpZip), base: tmpZip, tmpZip };
    } catch (e) {
      fs.rmSync(tmpZip, { recursive: true, force: true });
      throw e;
    }
  }
  if (input.files?.length) {
    const dir = path.dirname(input.files[0]);
    const reals = await Promise.all(input.files.map((f) => fs.promises.realpath(f)));
    const draft = {
      ...(await readFolder(dir, { files: input.files })),
      importSource: filesKey(reals),
    };
    return { draft, base: await fs.promises.realpath(dir) };
  }
  if (!input.path)
    throw new AppError(
      400,
      'FONTE_VAZIA',
      'Escolha uma pasta, um zip, arquivos ou um link do YouTube.',
    );
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(input.path);
  } catch {
    throw new AppError(404, 'FONTE_AUSENTE', 'Caminho não encontrado. Confira e tente de novo.');
  }
  const real = await fs.promises.realpath(input.path);
  if (stat.isDirectory()) {
    const draft = isOcwPackage(real) ? await readOcw(real) : await readFolder(real);
    return { draft, base: real };
  }
  if (path.extname(real).toLowerCase() === '.zip') {
    const tmpZip = path.join(root, 'courses', `_tmp-${randomUUID()}`);
    try {
      await extractZip(real, tmpZip);
      const ocw = isOcwPackage(tmpZip);
      const draft = ocw ? await readOcw(tmpZip) : await readFolder(tmpZip);
      if (!ocw) draft.title = path.basename(real, path.extname(real));
      return {
        draft: { ...draft, origin: ocw ? 'ocw' : 'zip', importSource: real },
        base: tmpZip,
        tmpZip,
      };
    } catch (e) {
      fs.rmSync(tmpZip, { recursive: true, force: true });
      throw e;
    }
  }
  const dir = path.dirname(real);
  const draft = await readFolder(dir, { files: [real] });
  return {
    draft: { ...draft, importSource: filesKey([real]) },
    base: await fs.promises.realpath(dir),
  };
}

export async function importCourse(
  input: {
    root: string;
    owner: string;
    revision: number;
    path?: string;
    files?: string[];
    url?: string;
    courseId?: string;
  },
  deps: ImportDeps,
): Promise<{ revision: number; data: Workspace; courseId: string; report: ImportReport }> {
  const snapshot = await deps.readWorkspace(input.owner);
  if (snapshot.revision !== input.revision)
    throw new AppError(
      409,
      'REVISION_CONFLICT',
      'Recarregue os estudos antes de importar o curso.',
    );
  const { draft, base, tmpZip } = await readSource(
    input.root,
    input,
    deps.readYoutube ?? ReadYoutube,
  );
  try {
    const existing =
      snapshot.data.courses.find((c) => c.id === input.courseId) ??
      snapshot.data.courses.find((c) => c.importSource && c.importSource === draft.importSource) ??
      null;
    if (existing && deps.isBusy?.(existing.id))
      throw new AppError(
        409,
        'FILA_ATIVA',
        'Este curso está sendo processado. Reimporte quando a fila terminar.',
      );
    const manifest: Manifest = existing ? readManifest(input.root, existing.id) : { sources: {} };

    // Documentos: converte os que ainda não têm texto guardado.
    const converted = new Map<string, Converted>();
    const report = { scanned: 0, converterMissing: 0, failedDocuments: 0 };
    for (const lesson of draft.lessons) {
      let words = 0;
      const docs = lesson.sources.filter((s) => s.kind === 'documento' && s.path);
      for (const doc of docs) {
        const known = Object.values(manifest.sources).find(
          (s) => s.fingerprint === doc.fingerprint,
        );
        const cached =
          known && existing && courseFiles(input.root, existing.id).sourceText(known.id);
        let result: Converted;
        if (cached && fs.existsSync(cached)) {
          const markdown = fs.readFileSync(cached, 'utf8');
          result = {
            markdown,
            words: markdown.split(/\s+/).filter(Boolean).length,
            scanned: false,
            missing: false,
          };
        } else {
          try {
            const out = await deps.convertDocument(path.join(base, doc.path!));
            result = { ...out, markdown: out.scanned ? null : out.markdown, missing: false };
            if (out.scanned) report.scanned++;
          } catch (e) {
            if (e instanceof AppError && e.code === 'SEM_MARKITDOWN') report.converterMissing++;
            else report.failedDocuments++;
            result = { markdown: null, words: 0, scanned: false, missing: true };
          }
        }
        converted.set(doc.fingerprint, result);
        words += result.words;
      }
      const textSources = lesson.sources.some((s) => s.kind !== 'documento');
      if (docs.length && !textSources) {
        const results = docs.map((d) => converted.get(d.fingerprint)!);
        lesson.words = words;
        if (!results.some((r) => r.markdown))
          lesson.status = results.some((r) => r.scanned) ? 'escaneado' : 'sem-texto';
      }
    }

    const merged = mergeImport(existing, draft, manifest.sources, manifest.removedSourceIds);
    // Reimportar atualiza o estado das aulas ainda não processadas (ex.: o conversor foi instalado).
    const statusByFingerprint = new Map<string, LessonStatus>();
    for (const l of draft.lessons)
      for (const s of l.sources) statusByFingerprint.set(s.fingerprint, l.status ?? 'importada');
    const lessons = merged.course.lessons!.map((l) => {
      if (!l.status || !UNPROCESSED.includes(l.status)) return l;
      const states = (l.sourceIds ?? [])
        .map((id) => statusByFingerprint.get(merged.sources[id]?.fingerprint))
        .filter((s): s is LessonStatus => !!s);
      if (!states.length) return l;
      return { ...l, status: states.includes('importada') ? ('importada' as const) : states[0] };
    });
    const course = { ...merged.course, lessons };

    // A conversão pode demorar: se outra aba ou a fila salvou no meio, nada é trocado no disco.
    if ((await deps.readWorkspace(input.owner)).revision !== input.revision)
      throw new AppError(
        409,
        'REVISION_CONFLICT',
        'Os estudos mudaram durante a importação. Importe de novo.',
      );
    const files = courseFiles(input.root, course.id);
    let finalBase = base;
    if (tmpZip) {
      fs.rmSync(files.zipDir, { recursive: true, force: true });
      fs.mkdirSync(files.dir, { recursive: true });
      fs.renameSync(tmpZip, files.zipDir);
      finalBase = files.zipDir;
    }
    for (const source of Object.values(merged.sources)) {
      const text = converted.get(source.fingerprint)?.markdown;
      if (source.kind !== 'documento' || !text) continue;
      fs.mkdirSync(path.dirname(files.sourceText(source.id)), { recursive: true });
      fs.writeFileSync(files.sourceText(source.id), text, 'utf8');
    }
    writeManifest(input.root, course.id, { ...manifest, sources: merged.sources, base: finalBase });

    const courses = existing
      ? snapshot.data.courses.map((c) => (c.id === existing.id ? course : c))
      : [...snapshot.data.courses, course];
    const saved = await deps.saveWorkspace(input.owner, input.revision, {
      ...snapshot.data,
      courses,
    });
    return {
      revision: saved.revision,
      data: saved.data,
      courseId: course.id,
      report: {
        lessons: lessons.length,
        added: merged.added,
        missing: merged.missing,
        ignored: draft.ignored,
        ...report,
      },
    };
  } finally {
    if (tmpZip) fs.rmSync(tmpZip, { recursive: true, force: true });
  }
}
