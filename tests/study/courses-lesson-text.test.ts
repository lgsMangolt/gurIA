import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLessonText, PART_CHARS } from '@/lib/study/courses/lesson-text';
import { estimateLessons } from '@/lib/study/courses/estimate';
import { courseFiles } from '@/lib/study/courses/store';
import type { ImportSource, Lesson, Manifest } from '@/lib/study/courses/types';

let tmp = '',
  base = '',
  root = '';
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-ltext-'));
  base = path.join(tmp, 'curso');
  root = path.join(tmp, 'dados');
  fs.mkdirSync(base);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const src = (id: string, kind: ImportSource['kind'], file?: string): ImportSource => ({
  id,
  kind,
  path: file,
  title: file ?? id,
  fingerprint: `fp-${id}`,
});
const lesson = (sourceIds: string[]): Lesson => ({
  id: 'l1',
  title: 'Aula',
  minutes: 10,
  sourceIds,
});
const manifest = (sources: ImportSource[]): Manifest => ({
  sources: Object.fromEntries(sources.map((s) => [s.id, s])),
  base,
});
const write = (name: string, content: string) => fs.writeFileSync(path.join(base, name), content);

describe('loadLessonText', () => {
  it('junta legendas na ordem com tempos', async () => {
    write('a.srt', '1\n00:00:01,000 --> 00:00:02,000\nprimeira\n');
    write('b.srt', '1\n00:01:05,000 --> 00:01:06,000\nsegunda\n');
    const m = manifest([src('a', 'legenda', 'a.srt'), src('b', 'legenda', 'b.srt')]);
    const text = await loadLessonText(root, 'c1', lesson(['a', 'b']), m);
    expect(text.segments.map((s) => s.text)).toEqual(['primeira', 'segunda']);
    expect(text.body.indexOf('[00:01] primeira')).toBeLessThan(
      text.body.indexOf('[01:05] segunda'),
    );
    expect(text.chars).toBe(text.body.length);
    expect(text.parts).toBe(1);
  });

  it('inclui o texto convertido dos documentos', async () => {
    const m = manifest([src('d', 'documento', 'd.pdf')]);
    write('d.pdf', '%PDF');
    const file = courseFiles(root, 'c1').sourceText('d');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '# Lição\n汉字 com tradução');
    const text = await loadLessonText(root, 'c1', lesson(['d']), m);
    expect(text.markdown).toContain('汉字');
    expect(text.body).toContain('汉字');
  });

  it('segunda chamada não transcreve de novo', async () => {
    write('v.mp4', 'video');
    const m = manifest([src('v', 'video', 'v.mp4')]);
    const transcribe = vi.fn(async () => [{ startSeconds: 0, endSeconds: 3, text: 'fala' }]);
    await loadLessonText(root, 'c1', lesson(['v']), m, { transcribe });
    const again = await loadLessonText(root, 'c1', lesson(['v']), m, { transcribe });
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(again.segments[0].text).toBe('fala');
  });

  it('aula de 130.000 caracteres tem 3 partes', async () => {
    const m = manifest([src('d', 'documento', 'd.pdf')]);
    write('d.pdf', '%PDF');
    const file = courseFiles(root, 'c1').sourceText('d');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x'.repeat(130000));
    const text = await loadLessonText(root, 'c1', lesson(['d']), m);
    expect(PART_CHARS).toBe(60000);
    expect(text.parts).toBe(3);
  });

  it("fonte ausente no disco vira AppError 'FONTE_AUSENTE'", async () => {
    const m = manifest([src('a', 'legenda', 'sumiu.srt')]);
    await expect(loadLessonText(root, 'c1', lesson(['a']), m)).rejects.toMatchObject({
      code: 'FONTE_AUSENTE',
    });
  });

  it("texto convertido ausente é regerado se a fonte existe e, se não existe, vira 'TEXTO_AUSENTE'", async () => {
    write('d.pdf', '%PDF');
    const m = manifest([src('d', 'documento', 'd.pdf'), src('e', 'documento', 'sumiu.pdf')]);
    const convert = vi.fn(async () => ({ markdown: 'regerado', words: 1, scanned: false }));
    const text = await loadLessonText(root, 'c1', lesson(['d']), m, { convert });
    expect(text.markdown).toContain('regerado');
    expect(fs.readFileSync(courseFiles(root, 'c1').sourceText('d'), 'utf8')).toBe('regerado');
    await expect(loadLessonText(root, 'c1', lesson(['e']), m, { convert })).rejects.toMatchObject({
      code: 'TEXTO_AUSENTE',
    });
  });

  it('aula sem nenhum texto vira SEM_TEXTO', async () => {
    const m = manifest([{ ...src('v', 'video'), url: 'https://archive.org/x.mp4' }]);
    await expect(loadLessonText(root, 'c1', lesson(['v']), m)).rejects.toMatchObject({
      code: 'SEM_TEXTO',
    });
  });
});

describe('estimateLessons', () => {
  it('estimativa soma envios e minutos de transcrição', () => {
    expect(
      estimateLessons([
        { chars: 1000, needsTranscription: false },
        { chars: 130000, needsTranscription: false },
        { chars: 0, needsTranscription: true, durationSeconds: 1800 },
      ]),
    ).toEqual({ envios: 5, caracteres: 131000, transcricaoMinutos: 30 });
  });
});
