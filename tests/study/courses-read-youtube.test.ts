import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isYoutubeUrl, readYoutube, ytDlpPath } from '@/lib/study/courses/read-youtube';

let base = '',
  work = '';
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-yt-'));
  work = path.join(base, 'work');
  fs.mkdirSync(work);
  vi.stubEnv('LOCALAPPDATA', base);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(base, { recursive: true, force: true });
});
const install = () => {
  const exe = path.join(base, 'CognitiveStudyHubTools', 'yt-dlp', 'yt-dlp.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  return exe;
};
const VTT = (end: string) => `WEBVTT\n\n00:00:00.000 --> ${end}\nolá\n`;
type Info = { language?: string; subtitles?: string[]; auto?: string[]; end?: string };
const PLAYLIST = {
  _type: 'playlist',
  title: 'Curso no YouTube',
  entries: [
    { id: 'aaa', title: 'Aula 1', duration: 600 },
    { id: 'bbb', title: 'Aula 2', duration: 125 },
    { id: 'ccc', title: 'Aula 3', duration: 60 },
  ],
};
/**
 * Executor falso do yt-dlp: --flat-playlist -J devolve a playlist; -J de um vídeo devolve
 * idioma e legendas disponíveis; o download escreve <id>.<idioma>.vtt do idioma pedido.
 */
const fakeRun = (infos: Record<string, Info>) =>
  vi.fn(async (_exe: string, args: string[]) => {
    const url = args[args.length - 1];
    if (args.includes('--flat-playlist')) return JSON.stringify(PLAYLIST);
    const id = url.split('v=')[1];
    const info = infos[id] ?? {};
    if (args.includes('-J'))
      return JSON.stringify({
        id,
        language: info.language,
        subtitles: Object.fromEntries((info.subtitles ?? []).map((l) => [l, [{ ext: 'vtt' }]])),
        automatic_captions: Object.fromEntries((info.auto ?? []).map((l) => [l, [{ ext: 'vtt' }]])),
      });
    const lang = args[args.indexOf('--sub-langs') + 1];
    const available = args.includes('--write-auto-subs') ? info.auto : info.subtitles;
    if (available?.includes(lang))
      fs.writeFileSync(path.join(work, `${id}.${lang}.vtt`), VTT(info.end ?? '00:01:00.000'));
    return '';
  });

describe('readYoutube', () => {
  it('playlist vira aulas na ordem com duração', async () => {
    install();
    const run = fakeRun({
      aaa: { subtitles: ['pt'] },
      bbb: { subtitles: ['en'] },
      ccc: { auto: ['en-orig'] },
    });
    const draft = await readYoutube('https://www.youtube.com/playlist?list=PL1', work, run);
    expect(draft).toMatchObject({
      origin: 'youtube',
      title: 'Curso no YouTube',
      importSource: 'https://www.youtube.com/playlist?list=PL1',
    });
    expect(draft.lessons.map((l) => [l.title, l.minutes])).toEqual([
      ['Aula 1', 10],
      ['Aula 2', 3],
      ['Aula 3', 1],
    ]);
    const yt = draft.lessons[0].sources.find((s) => s.kind === 'youtube')!;
    expect(yt).toMatchObject({ url: 'https://www.youtube.com/watch?v=aaa', fingerprint: 'yt:aaa' });
  });

  it('prefere legenda manual à automática', async () => {
    install();
    const run = fakeRun({
      aaa: { subtitles: ['pt'], auto: ['pt-orig'] },
      ccc: { auto: ['en-orig'] },
    });
    const draft = await readYoutube('https://www.youtube.com/playlist?list=PL1', work, run);
    expect(draft.lessons[0].sources.find((s) => s.kind === 'legenda')!.caption).toBe('manual');
    expect(draft.lessons[2].sources.find((s) => s.kind === 'legenda')!.caption).toBe('automatica');
  });

  it('curso de idioma: prefere a legenda no idioma do vídeo, não a traduzida (revisão final I8)', async () => {
    install();
    const run = fakeRun({
      aaa: { language: 'ja', auto: ['pt', 'en', 'ja-orig'] },
      bbb: { language: 'en', subtitles: ['pt', 'en'] },
      ccc: { auto: ['pt', 'en'] },
    });
    const draft = await readYoutube('https://www.youtube.com/playlist?list=PL1', work, run);
    const caption = (i: number) => draft.lessons[i].sources.find((s) => s.kind === 'legenda');
    expect(caption(0)).toMatchObject({ path: 'aaa.ja-orig.vtt', caption: 'automatica' });
    expect(caption(1)).toMatchObject({ path: 'bbb.en.vtt', caption: 'manual' });
    // só traduções automáticas, sem a original: melhor ficar sem texto do que estudar a tradução
    expect(caption(2)).toBeUndefined();
    expect(draft.lessons[2].status).toBe('sem-texto');
  });

  it('vídeo sem legenda vira sem-texto', async () => {
    install();
    const draft = await readYoutube('https://www.youtube.com/playlist?list=PL1', work, fakeRun({}));
    expect(draft.lessons.every((l) => l.status === 'sem-texto')).toBe(true);
  });

  it('URL que não é do YouTube é recusada', async () => {
    install();
    expect(isYoutubeUrl('https://youtu.be/aaa')).toBe(true);
    expect(isYoutubeUrl('https://www.youtube.com/watch?v=aaa')).toBe(true);
    expect(isYoutubeUrl('https://evil.example/youtube.com/watch?v=a')).toBe(false);
    expect(isYoutubeUrl('http://www.youtube.com/watch?v=aaa')).toBe(false);
    await expect(readYoutube('https://example.com/x', work, fakeRun({}))).rejects.toMatchObject({
      code: 'URL_INVALIDA',
    });
  });

  it('sem yt-dlp lança SEM_YTDLP com mensagem em português', async () => {
    expect(ytDlpPath()).toBe('');
    await expect(readYoutube('https://youtu.be/aaa', work, fakeRun({}))).rejects.toMatchObject({
      code: 'SEM_YTDLP',
      message: expect.stringMatching(/instale/i),
    });
  });

  it('nunca passa argumento que baixe o vídeo', async () => {
    install();
    const run = fakeRun({ aaa: { subtitles: ['pt'] } });
    await readYoutube('https://www.youtube.com/playlist?list=PL1', work, run);
    for (const [, args] of run.mock.calls) {
      if (args.includes('--flat-playlist')) expect(args).toContain('-J');
      else expect(args).toContain('--skip-download');
    }
  });
});
