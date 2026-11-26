// Leitor do pacote offline do MIT OpenCourseWare (o zip "Download course").
// Cada vídeo vira uma aula com a sua legenda; cada PDF de material vira uma aula.
// Os vídeos não vêm no pacote e não são baixados: só o link fica guardado.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCaptions } from '../runtime/media';
import { fingerprintFile } from './fingerprint';
import { naturalCompare } from './read-folder';
import type { DraftLesson, ImportDraft, ImportSource } from './types';

type Resource = {
  resourcetype?: string;
  license?: string;
  title?: string;
  file?: string;
  file_type?: string;
  video_files?: {
    archive_url?: string;
    video_thumbnail_file?: string;
    video_captions_resources?: Array<{ file?: string }>;
    video_transcript_resources?: Array<{ file?: string }>;
  };
};

export function isOcwPackage(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, 'data.json')) &&
    fs.existsSync(path.join(dir, 'content_map.json')) &&
    fs.existsSync(path.join(dir, 'resources'))
  );
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** Nome do arquivo sem o prefixo de hash do OCW (ex.: `vtt0123…cdef_`), sem extensão, normalizado. */
const stem = (name: string) =>
  path
    .basename(name, path.extname(name))
    .replace(/^(vtt)?[0-9a-f]{32}_/i, '')
    .replace(/_\d+k$/i, '')
    .replace(/[-_]/g, '')
    .toLowerCase();
const youtubeId = (thumb?: string) => thumb?.match(/\/vi\/([^/]+)\//)?.[1];

/** Licença do curso: a declarada no pacote ou, sem ela, a mais frequente entre os recursos. */
function courseLicense(data: any, resources: Resource[]): string | undefined {
  const declared = data.license ?? data.course_image_metadata?.license;
  if (typeof declared === 'string' && declared) return declared;
  const count = new Map<string, number>();
  for (const r of resources)
    if (typeof r.license === 'string' && r.license)
      count.set(r.license, (count.get(r.license) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export async function readOcw(dir: string): Promise<ImportDraft> {
  const data = readJson(path.join(dir, 'data.json'));
  const staticDir = path.join(dir, 'static_resources');
  const statics = fs.existsSync(staticDir) ? fs.readdirSync(staticDir) : [];
  const resources: Resource[] = fs
    .readdirSync(path.join(dir, 'resources'), { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && fs.existsSync(path.join(dir, 'resources', d.name, 'data.json')),
    )
    .map((d) => readJson(path.join(dir, 'resources', d.name, 'data.json')));
  const used = new Set<string>();
  const rel = (name: string) => `static_resources/${name}`;
  const source = async (name: string, kind: ImportSource['kind']): Promise<ImportSource> => {
    used.add(name);
    return {
      id: randomUUID(),
      kind,
      path: rel(name),
      title: name,
      fingerprint: await fingerprintFile(dir, path.join(staticDir, name)),
    };
  };

  const videos = resources.filter((r) => r.resourcetype === 'Video');
  const transcripts = new Set<string>();
  const videoKeys = new Set<string>();
  for (const v of videos) {
    for (const t of v.video_files?.video_transcript_resources ?? [])
      if (t.file) transcripts.add(path.basename(t.file));
    const id = youtubeId(v.video_files?.video_thumbnail_file);
    if (id) videoKeys.add(stem(id));
    if (v.video_files?.archive_url) videoKeys.add(stem(v.video_files.archive_url));
  }

  const videoLessons: DraftLesson[] = [];
  for (const v of videos) {
    const files = v.video_files ?? {};
    const listed = (files.video_captions_resources ?? [])
      .map((c) => c.file && path.basename(c.file))
      .filter((n): n is string => !!n && statics.includes(n));
    const keys = [youtubeId(files.video_thumbnail_file), files.archive_url]
      .filter((k): k is string => !!k)
      .map(stem);
    const byName = statics.filter((n) => /\.(srt|vtt)$/i.test(n) && keys.includes(stem(n)));
    const candidates = listed.length ? listed : byName;
    const srt = candidates.filter((n) => /\.srt$/i.test(n));
    const chosen = (srt.length ? srt : candidates).slice(0, 1);
    for (const n of candidates) used.add(n);
    const sources: ImportSource[] = [];
    let minutes: number | null = null;
    for (const name of chosen) {
      sources.push(await source(name, 'legenda'));
      try {
        const segments = parseCaptions(fs.readFileSync(path.join(staticDir, name), 'utf8'));
        minutes = Math.ceil(segments[segments.length - 1].endSeconds / 60);
      } catch {
        // legenda ilegível: a aula fica sem texto
      }
    }
    if (files.archive_url)
      sources.push({
        id: randomUUID(),
        kind: 'video',
        url: files.archive_url,
        title: path.basename(files.archive_url),
        fingerprint: createHash('sha256').update(`url:${files.archive_url}`).digest('hex'),
      });
    videoLessons.push({
      title: v.title || 'Vídeo',
      sources,
      minutes,
      ...(minutes === null ? { status: 'sem-texto' as const } : {}),
    });
  }

  const docLessons: DraftLesson[] = [];
  for (const d of resources) {
    if (d.resourcetype !== 'Document' || !d.file || !/\.(pdf|docx|pptx)$/i.test(d.file)) continue;
    const name = path.basename(d.file);
    // Transcrições em PDF dos vídeos repetem a legenda: ficam de fora.
    if (d.title === '3play pdf file' || transcripts.has(name) || videoKeys.has(stem(name))) {
      used.add(name);
      continue;
    }
    if (!statics.includes(name)) continue;
    docLessons.push({
      title: d.title || name,
      sources: [await source(name, 'documento')],
      minutes: null,
    });
  }

  const byTitle = (a: DraftLesson, b: DraftLesson) => naturalCompare(a.title, b.title);
  const ignored = statics.filter((n) => !used.has(n)).map(rel);
  return {
    title: data.course_title || path.basename(dir),
    origin: 'ocw',
    license: courseLicense(data, resources),
    importSource: dir,
    lessons: [...videoLessons.sort(byTitle), ...docLessons.sort(byTitle)],
    ignored,
  };
}
