import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { courseFiles, readManifest, writeManifest } from '@/lib/study/courses/store';
import { fingerprintFile, fingerprintYoutube } from '@/lib/study/courses/fingerprint';

const temps: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-courses-'));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('manifest grava e lê com escrita atômica', () => {
  const root = temp();
  expect(readManifest(root, 'curso-1')).toEqual({ sources: {} });
  const manifest = {
    sources: { s1: { id: 's1', kind: 'legenda' as const, title: 'a', fingerprint: 'f' } },
  };
  writeManifest(root, 'curso-1', manifest);
  expect(readManifest(root, 'curso-1')).toEqual(manifest);
  const files = fs.readdirSync(courseFiles(root, 'curso-1').dir);
  expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]);
});

it("courseFiles não aceita courseId com '..' ou '/'", () => {
  const root = temp();
  expect(() => courseFiles(root, '../fora')).toThrow();
  expect(() => courseFiles(root, 'a/b')).toThrow();
  expect(() => courseFiles(root, 'ok').text('../x')).toThrow();
  expect(courseFiles(root, 'ok').text('aula-1')).toBe(
    path.join(root, 'courses', 'ok', 'text', 'aula-1.json'),
  );
});

it('a impressão digital muda com o conteúdo e não com a pasta de origem', async () => {
  const a = temp(),
    b = temp();
  fs.writeFileSync(path.join(a, 'x.srt'), 'um');
  fs.writeFileSync(path.join(b, 'x.srt'), 'um');
  const fa = await fingerprintFile(a, path.join(a, 'x.srt'));
  expect(await fingerprintFile(b, path.join(b, 'x.srt'))).toBe(fa);
  fs.writeFileSync(path.join(b, 'x.srt'), 'dois');
  expect(await fingerprintFile(b, path.join(b, 'x.srt'))).not.toBe(fa);
  expect(fingerprintYoutube('abc123')).toBe('yt:abc123');
});
