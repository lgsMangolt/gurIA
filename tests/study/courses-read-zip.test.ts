import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { extractZip } from '@/lib/study/courses/read-zip';
import { makeZip } from './helpers/make-zip';

const temps: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-zip-'));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('extrai zip válido', async () => {
  const base = temp();
  const zip = path.join(base, 'curso.zip');
  makeZip(zip, [
    { name: 'pasta/aula 1.srt', content: 'um' },
    { name: 'leia.txt', content: 'dois' },
  ]);
  const dest = path.join(base, 'out');
  expect(await extractZip(zip, dest)).toEqual({ files: 2, bytes: 6 });
  expect(fs.readFileSync(path.join(dest, 'pasta', 'aula 1.srt'), 'utf8')).toBe('um');
});

it("recusa entrada '../../x' com ZIP_INSEGURO e não escreve nada fora", async () => {
  const base = temp();
  const zip = path.join(base, 'mau.zip');
  makeZip(zip, [
    { name: 'ok.txt', content: 'a' },
    { name: '../../fora.txt', content: 'b' },
  ]);
  const dest = path.join(base, 'a', 'b', 'out');
  await expect(extractZip(zip, dest)).rejects.toMatchObject({ code: 'ZIP_INSEGURO' });
  expect(fs.existsSync(path.join(base, 'a', 'fora.txt'))).toBe(false);
  expect(fs.existsSync(path.join(base, 'fora.txt'))).toBe(false);
  expect(fs.existsSync(dest)).toBe(false);
});

it('recusa zip com mais arquivos que o limite com ZIP_GRANDE', async () => {
  const base = temp();
  const zip = path.join(base, 'grande.zip');
  makeZip(zip, [
    { name: 'a.txt', content: 'a' },
    { name: 'b.txt', content: 'b' },
    { name: 'c.txt', content: 'c' },
  ]);
  await expect(
    extractZip(zip, path.join(base, 'out'), { maxBytes: 1000, maxFiles: 2 }),
  ).rejects.toMatchObject({ code: 'ZIP_GRANDE' });
  await expect(
    extractZip(zip, path.join(base, 'out2'), { maxBytes: 2, maxFiles: 10 }),
  ).rejects.toMatchObject({ code: 'ZIP_GRANDE' });
});
