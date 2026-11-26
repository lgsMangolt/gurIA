import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyWorkspace, type Workspace } from '@/lib/study/domain';
import { planStudy } from '@/lib/study/planner';
import { AppError } from '@/lib/study/runtime/analysis';
import { importCourse } from '@/lib/study/courses/import-service';
import { courseFiles, readManifest } from '@/lib/study/courses/store';
import { makeZip } from './helpers/make-zip';

const SRT = `1\n00:00:00,000 --> 00:03:00,000\nolá turma\n`;
let tmp = '';
let db: { revision: number; data: Workspace };
const deps = (
  convert = vi.fn(async () => ({
    markdown: 'texto do pdf '.repeat(200),
    words: 600,
    scanned: false,
  })),
) => ({
  readWorkspace: async () => db,
  saveWorkspace: async (_owner: string, revision: number, data: Workspace) => {
    if (revision !== db.revision) throw new AppError(409, 'REVISION_CONFLICT', 'x');
    db = { revision: revision + 1, data };
    return db;
  },
  convertDocument: convert,
});
const folder = (files: Record<string, string>) => {
  const dir = fs.mkdtempSync(path.join(tmp, 'curso-'));
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), content);
  return dir;
};
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-import-'));
  db = { revision: 3, data: emptyWorkspace() };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const root = () => path.join(tmp, 'dados');

describe('importCourse', () => {
  it('importa pasta e grava texto dos documentos em disco, não no workspace', async () => {
    const dir = folder({ '1 Intro.srt': SRT, '2 Apostila.pdf': '%PDF' });
    const out = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    expect(out.revision).toBe(4);
    const course = db.data.courses.find((c) => c.id === out.courseId)!;
    expect(course.origin).toBe('pasta');
    expect(course.lessons!.map((l) => [l.title, l.minutes, l.minutesEstimated ?? false])).toEqual([
      ['1 Intro', 3, false],
      ['2 Apostila', 5, true],
    ]);
    expect(JSON.stringify(db.data)).not.toContain('texto do pdf');
    const manifest = readManifest(root(), out.courseId);
    const doc = Object.values(manifest.sources).find((s) => s.kind === 'documento')!;
    expect(fs.readFileSync(courseFiles(root(), out.courseId).sourceText(doc.id), 'utf8')).toContain(
      'texto do pdf',
    );
    expect(manifest.base).toBe(fs.realpathSync.native(dir));
    expect(out.report).toMatchObject({ lessons: 2, added: 2, missing: 0, scanned: 0 });
  });

  it("zip OCW detectado vira origem 'ocw'", async () => {
    const zip = path.join(tmp, 'ocw.zip');
    makeZip(zip, [
      { name: 'data.json', content: JSON.stringify({ course_title: 'OCW X', license: 'CC BY' }) },
      { name: 'content_map.json', content: '{}' },
      {
        name: 'resources/d/data.json',
        content: JSON.stringify({
          resourcetype: 'Document',
          title: 'Notas',
          file: '/courses/x/n_Notas.pdf',
        }),
      },
      { name: 'static_resources/n_Notas.pdf', content: '%PDF' },
    ]);
    const out = await importCourse({ root: root(), owner: 'o', revision: 3, path: zip }, deps());
    const course = db.data.courses[0];
    expect(course.origin).toBe('ocw');
    expect(course.title).toBe('OCW X');
    expect(course.importSource).toBe(fs.realpathSync.native(zip));
    expect(readManifest(root(), out.courseId).base).toBe(courseFiles(root(), out.courseId).zipDir);
    expect(fs.existsSync(path.join(courseFiles(root(), out.courseId).zipDir, 'data.json'))).toBe(
      true,
    );
  });

  it('reimportar a mesma pasta não cria curso novo', async () => {
    const dir = folder({ '1.srt': SRT, '2.srt': SRT });
    const first = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    const again = await importCourse({ root: root(), owner: 'o', revision: 4, path: dir }, deps());
    expect(again.courseId).toBe(first.courseId);
    expect(db.data.courses).toHaveLength(1);
    expect(again.report).toMatchObject({ added: 0, missing: 0 });
  });

  it("PDF escaneado vira aula 'escaneado' e entra em report.scanned", async () => {
    const dir = folder({ 'scan.pdf': '%PDF' });
    const convert = vi.fn(async () => ({ markdown: '', words: 0, scanned: true }));
    const out = await importCourse(
      { root: root(), owner: 'o', revision: 3, path: dir },
      deps(convert),
    );
    expect(db.data.courses[0].lessons![0].status).toBe('escaneado');
    expect(out.report.scanned).toBe(1);
  });

  it('sem o conversor, documentos ficam sem texto e o relatório avisa', async () => {
    const dir = folder({ 'a.pdf': '%PDF', 'b.srt': SRT });
    const convert = vi.fn(async () => {
      throw new AppError(503, 'SEM_MARKITDOWN', 'instale');
    });
    const out = await importCourse(
      { root: root(), owner: 'o', revision: 3, path: dir },
      deps(convert),
    );
    expect(db.data.courses[0].lessons!.find((l) => l.title === 'a')!.status).toBe('sem-texto');
    expect(out.report.converterMissing).toBe(1);
  });

  it('REVISION_CONFLICT quando a revisão está velha', async () => {
    const dir = folder({ '1.srt': SRT });
    await expect(
      importCourse({ root: root(), owner: 'o', revision: 2, path: dir }, deps()),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });

  it('aulas importadas entram no plano (planner) com a duração estimada', async () => {
    const dir = folder({ '1.srt': SRT, '2.pdf': '%PDF' });
    const out = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    const course = db.data.courses[0];
    const plan = JSON.stringify(planStudy(db.data, new Date(2026, 10, 23)));
    for (const l of course.lessons!) expect(plan).toContain(`lesson:${out.courseId}:${l.id}`);
  });

  it('link do YouTube vira curso youtube, com a legenda guardada na pasta do curso', async () => {
    const readYoutube = vi.fn(async (url: string, workdir: string) => {
      fs.mkdirSync(workdir, { recursive: true });
      fs.writeFileSync(
        path.join(workdir, 'aaa.pt.vtt'),
        `WEBVTT

00:00:00.000 --> 00:01:00.000
olá
`,
      );
      return {
        title: 'Playlist',
        origin: 'youtube' as const,
        importSource: url,
        ignored: [],
        lessons: [
          {
            title: 'Aula 1',
            minutes: 1,
            sources: [
              {
                id: 'x',
                kind: 'legenda' as const,
                path: 'aaa.pt.vtt',
                title: 'aaa.pt.vtt',
                fingerprint: 'f-aaa',
                caption: 'manual' as const,
              },
              {
                id: 'y',
                kind: 'youtube' as const,
                url: 'https://www.youtube.com/watch?v=aaa',
                title: 'Aula 1',
                fingerprint: 'yt:aaa',
              },
            ],
          },
        ],
      };
    });
    const url = 'https://www.youtube.com/playlist?list=PL1';
    const out = await importCourse(
      { root: root(), owner: 'o', revision: 3, url },
      { ...deps(), readYoutube },
    );
    expect(readYoutube).toHaveBeenCalledWith(url, expect.stringContaining('_tmp-'));
    expect(db.data.courses[0]).toMatchObject({ origin: 'youtube', importSource: url });
    const files = courseFiles(root(), out.courseId);
    expect(readManifest(root(), out.courseId).base).toBe(files.zipDir);
    expect(fs.existsSync(path.join(files.zipDir, 'aaa.pt.vtt'))).toBe(true);
    const again = await importCourse(
      { root: root(), owner: 'o', revision: 4, url },
      { ...deps(), readYoutube },
    );
    expect(again.courseId).toBe(out.courseId);
  });

  it('arquivo solto da mesma pasta vira outro curso, sem marcar fonte ausente (revisão final I1)', async () => {
    const dir = folder({ '1.srt': SRT, '2.srt': SRT });
    const first = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    const single = await importCourse(
      { root: root(), owner: 'o', revision: 4, path: path.join(dir, '2.srt') },
      deps(),
    );
    expect(single.courseId).not.toBe(first.courseId);
    const original = db.data.courses.find((c) => c.id === first.courseId)!;
    expect(original.lessons!.map((l) => l.status)).toEqual(['importada', 'importada']);
    const again = await importCourse(
      { root: root(), owner: 'o', revision: 5, files: [path.join(dir, '2.srt')] },
      deps(),
    );
    expect(again.courseId).toBe(single.courseId);
  });

  it('não importa por cima de um curso com fila rodando (revisão final I6)', async () => {
    const dir = folder({ '1.srt': SRT });
    const first = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    await expect(
      importCourse(
        { root: root(), owner: 'o', revision: 4, path: dir },
        { ...deps(), isBusy: (id: string) => id === first.courseId },
      ),
    ).rejects.toMatchObject({ code: 'FILA_ATIVA' });
  });

  it('revisão mudou durante a conversão: recusa antes de trocar os arquivos (revisão final I6)', async () => {
    const zip = path.join(tmp, 'c.zip');
    makeZip(zip, [{ name: 'a.srt', content: SRT }]);
    const first = await importCourse({ root: root(), owner: 'o', revision: 3, path: zip }, deps());
    const zipDir = courseFiles(root(), first.courseId).zipDir;
    const before = fs.readdirSync(zipDir);
    let reads = 0;
    const racing = {
      ...deps(),
      readWorkspace: async () => (++reads === 1 ? db : { ...db, revision: db.revision + 1 }),
    };
    await expect(
      importCourse({ root: root(), owner: 'o', revision: 4, path: zip }, racing),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(fs.readdirSync(zipDir)).toEqual(before);
    expect(
      fs.readdirSync(path.join(root(), 'courses')).filter((n) => n.startsWith('_tmp-')),
    ).toEqual([]);
  });

  it("reimportar tira a aula de 'texto-ausente'", async () => {
    const dir = folder({ '1.srt': SRT });
    const first = await importCourse({ root: root(), owner: 'o', revision: 3, path: dir }, deps());
    db.data.courses[0].lessons![0].status = 'texto-ausente';
    await importCourse({ root: root(), owner: 'o', revision: 4, path: dir }, deps());
    expect(db.data.courses.find((c) => c.id === first.courseId)!.lessons![0].status).toBe(
      'importada',
    );
  });
});
