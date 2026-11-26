import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readFolder } from '@/lib/study/courses/read-folder';
import { insideRoot } from '@/lib/study/courses/safe-path';

const SRT = (end = '00:02:30,000') => `1\n00:00:00,000 --> ${end}\nOlá turma\n`;
const temps: string[] = [];
function folder(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-folder-'));
  temps.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readFolder', () => {
  it('ordena por número natural, sem diferenciar maiúsculas, sem número no fim', async () => {
    const dir = folder({ 'Intro.srt': SRT(), 'Aula 10.srt': SRT(), 'aula 2.srt': SRT() });
    const draft = await readFolder(dir);
    expect(draft.origin).toBe('pasta');
    expect(draft.lessons.map((l) => l.title)).toEqual(['aula 2', 'Aula 10', 'Intro']);
  });

  it('agrupa legenda, documento e vídeo do mesmo nome-base numa aula', async () => {
    const dir = folder({ '01 Intro.srt': SRT(), '01 Intro.pdf': '%PDF', '01 Intro.mp4': 'v' });
    const draft = await readFolder(dir);
    expect(draft.lessons).toHaveLength(1);
    expect(draft.lessons[0].sources.map((s) => s.kind).sort()).toEqual([
      'documento',
      'legenda',
      'video',
    ]);
    expect(draft.lessons[0].minutes).toBe(3);
  });

  it('com .srt e .vtt da mesma aula usa só o .srt', async () => {
    const dir = folder({ 'a.srt': SRT(), 'a.vtt': `WEBVTT\n\n${SRT().replace(',', '.')}` });
    const [lesson] = (await readFolder(dir)).lessons;
    expect(lesson.sources.map((s) => path.extname(s.path!))).toEqual(['.srt']);
  });

  it('ignora .html, .js, .css e imagens e lista em ignored', async () => {
    const dir = folder({
      'a.srt': SRT(),
      'index.html': '<p>',
      'app.js': '',
      's.css': '',
      'f.png': '',
    });
    const draft = await readFolder(dir);
    expect(draft.lessons).toHaveLength(1);
    expect([...draft.ignored].sort()).toEqual(['app.js', 'f.png', 'index.html', 's.css']);
  });

  it("legenda inválida vira aula 'sem-texto' em vez de derrubar a importação", async () => {
    const dir = folder({ 'ruim.srt': 'sem horários aqui', 'boa.srt': SRT() });
    const draft = await readFolder(dir);
    const bad = draft.lessons.find((l) => l.title === 'ruim')!;
    expect(bad.status).toBe('sem-texto');
    expect(draft.lessons.find((l) => l.title === 'boa')!.status).toBeUndefined();
  });

  it("vídeo sem legenda fica 'precisa-transcrever'", async () => {
    const dir = folder({ 'aula.mp4': 'v' });
    expect((await readFolder(dir)).lessons[0].status).toBe('precisa-transcrever');
  });

  it('com files lê só os arquivos escolhidos, como origem arquivos', async () => {
    const dir = folder({ 'a.srt': SRT(), 'b.srt': SRT() });
    const draft = await readFolder(dir, { files: [path.join(dir, 'b.srt')] });
    expect(draft.origin).toBe('arquivos');
    expect(draft.lessons.map((l) => l.title)).toEqual(['b']);
  });

  it('arquivo fora da raiz é recusado com FORA_DA_PASTA', async () => {
    const dir = folder({ 'a.srt': SRT() });
    const other = folder({ 'x.srt': SRT() });
    await expect(readFolder(dir, { files: [path.join(other, 'x.srt')] })).rejects.toMatchObject({
      code: 'FORA_DA_PASTA',
    });
    await expect(insideRoot(dir, path.join(dir, '..'))).rejects.toMatchObject({
      code: 'FORA_DA_PASTA',
    });
  });

  it('em subpastas, ordena pasta por pasta (revisão final I7)', async () => {
    const dir = folder({
      'Módulo 2/01 Prática.srt': SRT(),
      'Módulo 1/Introdução.srt': SRT(),
      'Módulo 1/01 Conceitos.srt': SRT(),
    });
    const draft = await readFolder(dir);
    expect(draft.lessons.map((l) => l.title)).toEqual(['01 Conceitos', 'Introdução', '01 Prática']);
  });
});
