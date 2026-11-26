// Texto de uma aula importada: legendas com tempo, Markdown dos documentos e,
// para vídeo ou áudio local sem legenda, a transcrição do Whisper (guardada em disco).
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../runtime/analysis';
import { parseCaptions, transcribeFile, type Segment } from '../runtime/media';
import { convertDocument } from './markitdown';
import { courseFiles, writeJsonAtomic } from './store';
import type { ImportSource, Lesson, Manifest } from './types';

/** Limite de caracteres por envio à IA; aula maior é dividida em partes. */
export const PART_CHARS = 60000;

export type LessonText = {
  segments: Segment[];
  markdown: string;
  /** Texto completo enviado à IA: legendas com [mm:ss] e documentos com o título da fonte. */
  body: string;
  chars: number;
  parts: number;
};

type Deps = { transcribe?: typeof transcribeFile; convert?: typeof convertDocument };

const clock = (seconds: number) => {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

const missing = (s: ImportSource) =>
  new AppError(
    404,
    'FONTE_AUSENTE',
    `Fonte não encontrada no disco: ${s.title}. Reimporte o curso.`,
  );

/** Fontes que precisam de transcrição local (mídia com arquivo e sem legenda na aula). */
export function mediaToTranscribe(lesson: Lesson, manifest: Manifest): ImportSource[] {
  const sources = (lesson.sourceIds ?? []).map((id) => manifest.sources[id]).filter(Boolean);
  if (sources.some((s) => s.kind === 'legenda')) return [];
  return sources.filter((s) => (s.kind === 'video' || s.kind === 'audio') && s.path);
}

export async function loadLessonText(
  root: string,
  courseId: string,
  lesson: Lesson,
  manifest: Manifest,
  deps: Deps = {},
): Promise<LessonText> {
  const files = courseFiles(root, courseId);
  const base = manifest.base ?? '';
  const sources = (lesson.sourceIds ?? []).map((id) => manifest.sources[id]).filter(Boolean);
  const toTranscribe = new Set(mediaToTranscribe(lesson, manifest).map((s) => s.id));
  const cacheFile = files.text(lesson.id);
  const cache: { transcripts?: Record<string, Segment[]> } = fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    : {};
  const segments: Segment[] = [];
  const blocks: string[] = [];
  const docs: string[] = [];

  for (const s of sources) {
    const abs = s.path ? path.join(base, s.path) : '';
    if (s.kind === 'legenda') {
      if (!abs || !fs.existsSync(abs)) throw missing(s);
      const parsed = parseCaptions(fs.readFileSync(abs, 'utf8'));
      segments.push(...parsed);
      blocks.push(
        `## ${s.title}\n${parsed.map((x) => `[${clock(x.startSeconds)}] ${x.text}`).join('\n')}`,
      );
    } else if (s.kind === 'documento') {
      const textFile = files.sourceText(s.id);
      let markdown: string;
      if (fs.existsSync(textFile)) markdown = fs.readFileSync(textFile, 'utf8');
      else if (abs && fs.existsSync(abs)) {
        const out = await (deps.convert ?? convertDocument)(abs);
        markdown = out.scanned ? '' : out.markdown;
        fs.mkdirSync(path.dirname(textFile), { recursive: true });
        fs.writeFileSync(textFile, markdown, 'utf8');
      } else
        throw new AppError(
          409,
          'TEXTO_AUSENTE',
          `O texto de ${s.title} não está neste computador e a fonte também não. Reimporte o curso.`,
        );
      if (markdown.trim()) {
        docs.push(markdown);
        blocks.push(`## ${s.title}\n${markdown}`);
      }
    } else if (toTranscribe.has(s.id)) {
      if (!fs.existsSync(abs)) throw missing(s);
      let transcript = cache.transcripts?.[s.id];
      if (!transcript) {
        transcript = await (deps.transcribe ?? transcribeFile)(
          abs,
          path.join(files.dir, 'work', lesson.id),
        );
        cache.transcripts = { ...cache.transcripts, [s.id]: transcript };
        writeJsonAtomic(cacheFile, cache);
      }
      segments.push(...transcript);
      blocks.push(
        `## ${s.title} (transcrição local)\n${transcript.map((x) => `[${clock(x.startSeconds)}] ${x.text}`).join('\n')}`,
      );
    }
  }

  const body = blocks.join('\n\n');
  if (!body.trim())
    throw new AppError(
      422,
      'SEM_TEXTO',
      'Esta aula não tem legenda, transcrição nem texto de documento.',
    );
  return {
    segments,
    markdown: docs.join('\n\n'),
    body,
    chars: body.length,
    parts: Math.max(1, Math.ceil(body.length / PART_CHARS)),
  };
}

/**
 * Tamanho aproximado do que vai à IA, sem transcrever nem converter nada:
 * legendas e textos já guardados contam; mídia sem transcrição só informa a duração.
 */
export function describeLesson(
  root: string,
  courseId: string,
  lesson: Lesson,
  manifest: Manifest,
): { chars: number; needsTranscription: boolean; durationSeconds: number } {
  const files = courseFiles(root, courseId);
  const base = manifest.base ?? '';
  let chars = 0;
  for (const id of lesson.sourceIds ?? []) {
    const s = manifest.sources[id];
    if (!s?.path) continue;
    const file = s.kind === 'documento' ? files.sourceText(s.id) : path.join(base, s.path);
    if (s.kind !== 'documento' && s.kind !== 'legenda') continue;
    if (fs.existsSync(file)) chars += fs.statSync(file).size;
  }
  const cache = fs.existsSync(files.text(lesson.id))
    ? JSON.parse(fs.readFileSync(files.text(lesson.id), 'utf8'))
    : {};
  const pending = mediaToTranscribe(lesson, manifest).filter((s) => !cache.transcripts?.[s.id]);
  return {
    chars,
    needsTranscription: pending.length > 0,
    durationSeconds: pending.length ? lesson.minutes * 60 : 0,
  };
}
