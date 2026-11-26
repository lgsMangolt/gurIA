// Leitor do YouTube pelo yt-dlp: lista de vídeos (playlist ou vídeo único) e legendas.
// Nunca baixa o vídeo: a lista vem de --flat-playlist -J e as legendas de --skip-download.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../runtime/analysis';
import { parseCaptions, runLocal } from '../runtime/media';
import { fingerprintFile, fingerprintYoutube } from './fingerprint';
import type { DraftLesson, ImportDraft, ImportSource } from './types';

export function ytDlpPath(): string {
  const root = process.env.LOCALAPPDATA || os.homedir();
  const exe = path.join(root, 'CognitiveStudyHubTools', 'yt-dlp', 'yt-dlp.exe');
  return fs.existsSync(exe) ? exe : '';
}

const YOUTUBE = /^https:\/\/(www\.youtube\.com\/(watch\?v=|playlist\?list=)|youtu\.be\/)[\w-]+/;
export function isYoutubeUrl(url: string): boolean {
  return YOUTUBE.test(url);
}

/**
 * Escolhe a legenda a baixar. A original vale mais que a tradução, porque o curso pode ser
 * de idioma e a IA já traduz para o português preservando os termos do original:
 * 1. manual no idioma do vídeo; 2. outra manual (português, inglês, qualquer);
 * 3. automática original (`<idioma>-orig` ou `<idioma>`); 4. qualquer automática `-orig`.
 * Automática só traduzida não serve: a aula fica sem texto.
 */
export function pickCaption(info: {
  language?: string;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}): { lang: string; kind: 'manual' | 'automatica' } | null {
  const manual = Object.keys(info.subtitles ?? {}).filter((l) => l !== 'live_chat');
  const auto = Object.keys(info.automatic_captions ?? {});
  const lang = info.language?.toLowerCase();
  const sameLang = (l: string) =>
    !!lang && (l.toLowerCase() === lang || l.toLowerCase().startsWith(lang + '-'));
  const byPreference = (list: string[]) =>
    [...list].sort((a, b) => {
      const r = (l: string) => (/^pt/i.test(l) ? 0 : /^en/i.test(l) ? 1 : 2);
      return r(a) - r(b);
    });
  const m = manual.find(sameLang) ?? byPreference(manual)[0];
  if (m) return { lang: m, kind: 'manual' };
  const a =
    (lang &&
      (auto.find((l) => l.toLowerCase() === `${lang}-orig`) ??
        auto.find((l) => l.toLowerCase() === lang))) ||
    auto.find((l) => /-orig$/i.test(l));
  return a ? { lang: a, kind: 'automatica' } : null;
}

export async function readYoutube(
  url: string,
  workdir: string,
  run: typeof runLocal = runLocal,
): Promise<ImportDraft> {
  if (!isYoutubeUrl(url))
    throw new AppError(400, 'URL_INVALIDA', 'Use um link de vídeo ou playlist do YouTube (https).');
  const exe = ytDlpPath();
  if (!exe)
    throw new AppError(
      503,
      'SEM_YTDLP',
      'Para importar do YouTube instale o yt-dlp: veja docs/guia/instalacao.md (Importar do YouTube).',
    );
  fs.mkdirSync(workdir, { recursive: true });
  const meta = JSON.parse(await run(exe, ['--flat-playlist', '-J', '--no-warnings', url], 120000));
  const videos: Array<{ id: string; title?: string; duration?: number }> =
    meta._type === 'playlist' ? (meta.entries ?? []) : [meta];

  const lessons: DraftLesson[] = [];
  for (const v of videos.filter((x) => x?.id)) {
    const watch = `https://www.youtube.com/watch?v=${v.id}`;
    const out = path.join(workdir, '%(id)s.%(ext)s');
    // Metadados do vídeo (idioma e legendas disponíveis), sem baixar nada.
    const info = JSON.parse(
      await run(exe, ['-J', '--skip-download', '--no-warnings', watch], 120000),
    );
    const choice = pickCaption(info);
    let caption: ImportSource['caption'] | undefined;
    if (choice) {
      await run(
        exe,
        [
          '--skip-download',
          choice.kind === 'manual' ? '--write-subs' : '--write-auto-subs',
          '--sub-langs',
          choice.lang,
          '--sub-format',
          'vtt',
          '--no-warnings',
          '-o',
          out,
          watch,
        ],
        300000,
      );
      caption = choice.kind;
    }
    const sources: ImportSource[] = [
      {
        id: randomUUID(),
        kind: 'youtube',
        url: watch,
        title: v.title || v.id,
        fingerprint: fingerprintYoutube(v.id),
      },
    ];
    let minutes = v.duration ? Math.ceil(v.duration / 60) : null;
    const file = choice
      ? fs.readdirSync(workdir).find((f) => f === `${v.id}.${choice.lang}.vtt`)
      : undefined;
    let readable = false;
    if (file && caption) {
      const abs = path.join(workdir, file);
      sources.unshift({
        id: randomUUID(),
        kind: 'legenda',
        path: file,
        title: file,
        caption,
        fingerprint: await fingerprintFile(workdir, abs),
      });
      try {
        const segments = parseCaptions(fs.readFileSync(abs, 'utf8'));
        minutes ??= Math.ceil(segments[segments.length - 1].endSeconds / 60);
        readable = true;
      } catch {
        // legenda ilegível: a aula fica sem texto
      }
    }
    lessons.push({
      title: v.title || v.id,
      sources,
      minutes,
      ...(readable ? {} : { status: 'sem-texto' as const }),
    });
  }
  return {
    title: meta.title || 'Curso do YouTube',
    origin: 'youtube',
    importSource: url,
    lessons,
    ignored: [],
  };
}
