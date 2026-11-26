import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isOcwPackage, readOcw } from '@/lib/study/courses/read-ocw';
import { extractZip } from '@/lib/study/courses/read-zip';

const SLUG = '/courses/curso-teste-2020';
const SRT = (end: string) => `1\n00:00:00,000 --> ${end}\nolá\n`;
const temps: string[] = [];
afterAll(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function ocwFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-ocw-'));
  temps.push(dir);
  const write = (rel: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  };
  write(
    'data.json',
    JSON.stringify({
      course_title: 'Curso Teste',
      license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    }),
  );
  write('content_map.json', '{}');
  write('index.html', '<html>');
  const resource = (name: string, data: object) =>
    write(`resources/${name}/data.json`, JSON.stringify(data));
  // Vídeo com a legenda listada nos metadados.
  resource('v10', {
    resourcetype: 'Video',
    title: 'Aula 10: revisão',
    video_files: {
      archive_url: 'https://archive.org/download/X/X_Aula10_300k.mp4',
      video_thumbnail_file: 'https://img.youtube.com/vi/AAA111/default.jpg',
      video_captions_resources: [{ file: `${SLUG}/aaaa_AAA111.vtt` }],
      video_transcript_resources: [{ file: `${SLUG}/tttt_AAA111.pdf` }],
    },
  });
  write('static_resources/aaaa_AAA111.vtt', `WEBVTT\n\n${SRT('00:12:00.000')}`);
  // Vídeo sem legenda nos metadados: liga pelo nome do arquivo do vídeo.
  resource('v2', {
    resourcetype: 'Video',
    title: 'Aula 2: tons',
    video_files: { archive_url: 'https://archive.org/download/X/X_Aula2-zh_300k.mp4' },
  });
  write('static_resources/0123456789abcdef0123456789abcdef_X_Aula2_zh.srt', SRT('00:05:00,000'));
  write(
    'static_resources/vtt0123456789abcdef0123456789abcdef_X_Aula2_zh.vtt',
    `WEBVTT\n\n${SRT('00:05:00.000')}`,
  );
  // Documentos.
  resource('d1', {
    resourcetype: 'Document',
    title: 'Exercícios 1',
    file: `${SLUG}/e1_Ex1.pdf`,
    file_type: 'application/pdf',
  });
  write('static_resources/e1_Ex1.pdf', '%PDF');
  resource('t1', {
    resourcetype: 'Document',
    title: '3play pdf file',
    file: `${SLUG}/tttt_AAA111.pdf`,
    file_type: 'application/pdf',
  });
  write('static_resources/tttt_AAA111.pdf', '%PDF');
  resource('img', {
    resourcetype: 'Image',
    title: 'capa.jpg',
    file: `${SLUG}/capa.jpg`,
    file_type: 'image/jpeg',
  });
  return dir;
}

describe('readOcw (pacote sintético)', () => {
  const dir = ocwFixture();

  it('reconhece o pacote', () => {
    expect(isOcwPackage(dir)).toBe(true);
    expect(isOcwPackage(path.join(dir, 'resources'))).toBe(false);
  });

  it('lê título e licença', async () => {
    const draft = await readOcw(dir);
    expect(draft.origin).toBe('ocw');
    expect(draft.title).toBe('Curso Teste');
    expect(draft.license).toContain('by-nc-sa/4.0');
  });

  it('um vídeo vira aula com a legenda ligada (pelos metadados ou pelo nome)', async () => {
    const { lessons } = await readOcw(dir);
    const ten = lessons.find((l) => l.title === 'Aula 10: revisão')!;
    expect(ten.sources.find((s) => s.kind === 'legenda')!.path).toBe(
      'static_resources/aaaa_AAA111.vtt',
    );
    expect(ten.sources.find((s) => s.kind === 'video')!.url).toContain('archive.org');
    expect(ten.minutes).toBe(12);
    const two = lessons.find((l) => l.title === 'Aula 2: tons')!;
    const captions = two.sources.filter((s) => s.kind === 'legenda');
    expect(captions.map((s) => path.extname(s.path!))).toEqual(['.srt']);
  });

  it('3play pdf file não vira aula', async () => {
    const { lessons } = await readOcw(dir);
    expect(lessons.map((l) => l.title)).not.toContain('3play pdf file');
  });

  it('ordem: vídeos e depois documentos em ordem natural', async () => {
    const { lessons } = await readOcw(dir);
    expect(lessons.map((l) => l.title)).toEqual([
      'Aula 2: tons',
      'Aula 10: revisão',
      'Exercícios 1',
    ]);
  });
});

const realZip = process.env.GURIA_OCW_ZIP;
describe.skipIf(!realZip || !fs.existsSync(realZip))(
  'readOcw (zip real do MIT, só leitura)',
  () => {
    it('Chinese I: 11 aulas de vídeo, todas com legenda, sem 3play', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-ocw-real-'));
      temps.push(dir);
      await extractZip(realZip!, dir);
      const draft = await readOcw(dir);
      expect(draft.title).toBe('Chinese I (Streamlined)');
      expect(draft.license).toContain('by-nc-sa/4.0');
      const videos = draft.lessons.filter((l) => l.sources.some((s) => s.kind === 'video'));
      expect(videos).toHaveLength(11);
      expect(
        videos.filter((l) => !l.sources.some((s) => s.kind === 'legenda')).map((l) => l.title),
      ).toEqual([]);
      expect(draft.lessons.map((l) => l.title)).not.toContain('3play pdf file');
      const docs = draft.lessons.filter((l) => l.sources.some((s) => s.kind === 'documento'));
      expect(docs.length).toBeGreaterThan(30);
    }, 120000);
  },
);
