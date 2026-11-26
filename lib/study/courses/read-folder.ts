// Leitor de pasta e de arquivos soltos: uma aula por nome-base, em ordem natural.
// Não executa nada e não segue atalhos: só lê os arquivos dentro da pasta escolhida.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseCaptions } from '../runtime/media';
import { fingerprintFile } from './fingerprint';
import { insideRoot } from './safe-path';
import type { DraftLesson, ImportDraft, ImportSource } from './types';

const KINDS: Record<string, ImportSource['kind']> = {
  '.srt': 'legenda',
  '.vtt': 'legenda',
  '.pdf': 'documento',
  '.docx': 'documento',
  '.pptx': 'documento',
  '.mp4': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mp3': 'audio',
  '.m4a': 'audio',
  '.wav': 'audio',
};

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
/** Pasta por pasta em ordem natural; dentro da pasta, numerados primeiro e depois os sem número. */
export function naturalCompare(a: string, b: string): number {
  const da = path.posix.dirname(a).split('/'),
    db = path.posix.dirname(b).split('/');
  for (let i = 0; i < Math.max(da.length, db.length); i++) {
    if (da[i] === db[i]) continue;
    if (da[i] === undefined) return -1;
    if (db[i] === undefined) return 1;
    return collator.compare(da[i], db[i]);
  }
  const na = /\d/.test(path.posix.basename(a)),
    nb = /\d/.test(path.posix.basename(b));
  if (na !== nb) return na ? -1 : 1;
  return collator.compare(a, b);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) walk(full, out);
    else if (item.isFile()) out.push(full);
  }
  return out;
}

export async function readFolder(
  root: string,
  opts: { files?: string[] } = {},
): Promise<ImportDraft> {
  const base = await fs.promises.realpath(root);
  const files = opts.files
    ? await Promise.all(opts.files.map((f) => insideRoot(base, f)))
    : walk(base);
  const rel = (f: string) => path.relative(base, f).split(path.sep).join('/');
  const groups = new Map<string, string[]>();
  const ignored: string[] = [];
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!KINDS[ext]) {
      ignored.push(rel(file));
      continue;
    }
    const key = rel(file).slice(0, -ext.length);
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }

  const lessons: DraftLesson[] = [];
  for (const key of [...groups.keys()].sort(naturalCompare)) {
    let members = groups.get(key)!;
    if (members.some((f) => path.extname(f).toLowerCase() === '.srt'))
      members = members.filter((f) => path.extname(f).toLowerCase() !== '.vtt');
    const sources: ImportSource[] = [];
    let minutes: number | null = null;
    let captionsOk = false;
    for (const file of members.sort()) {
      const kind = KINDS[path.extname(file).toLowerCase()];
      sources.push({
        id: randomUUID(),
        kind,
        path: rel(file),
        title: path.basename(file),
        fingerprint: await fingerprintFile(base, file),
      });
      if (kind === 'legenda') {
        try {
          const segments = parseCaptions(fs.readFileSync(file, 'utf8'));
          minutes = Math.ceil(segments[segments.length - 1].endSeconds / 60);
          captionsOk = true;
        } catch {
          // Legenda sem horários válidos: a aula fica sem texto, a importação segue.
        }
      }
    }
    const kinds = new Set(sources.map((s) => s.kind));
    const media = kinds.has('video') || kinds.has('audio');
    const status = captionsOk
      ? undefined
      : media
        ? ('precisa-transcrever' as const)
        : kinds.has('documento')
          ? undefined
          : ('sem-texto' as const);
    lessons.push({
      title: path.posix.basename(key),
      sources,
      minutes,
      ...(status ? { status } : {}),
    });
  }

  return {
    title: path.basename(base),
    origin: opts.files ? 'arquivos' : 'pasta',
    importSource: base,
    lessons,
    ignored,
  };
}
