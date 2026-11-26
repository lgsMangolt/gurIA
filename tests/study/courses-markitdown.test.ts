import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '@/lib/study/runtime/analysis';
import { convertDocument, markitdownPath, markitdownReady } from '@/lib/study/courses/markitdown';

let base = '';
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-md-'));
  vi.stubEnv('LOCALAPPDATA', base);
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(base, { recursive: true, force: true });
});
const install = () => {
  const exe = path.join(base, 'CognitiveStudyHubTools', 'markitdown', 'Scripts', 'markitdown.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  return exe;
};
/** `run` falso: escreve no arquivo de saída (-o) o texto dado. */
const fakeRun = (markdown: string) =>
  vi.fn(async (_exe: string, args: string[]) => {
    fs.writeFileSync(args[args.indexOf('-o') + 1], markdown, 'utf8');
    return '';
  });

describe('convertDocument', () => {
  it('devolve o markdown e a contagem de palavras', async () => {
    const exe = install();
    expect(markitdownPath()).toBe(exe);
    expect(markitdownReady()).toBe(true);
    const run = fakeRun('# Lição 1\n\n汉字 hànzì: caracteres chineses usados na escrita.');
    const out = await convertDocument(path.join(base, 'a.pdf'), run);
    expect(out.markdown).toContain('汉字');
    expect(out.words).toBe(10);
    expect(out.scanned).toBe(false);
    expect(run.mock.calls[0][0]).toBe(exe);
    expect(run.mock.calls[0][1][0]).toBe(path.join(base, 'a.pdf'));
  });

  it('PDF quase sem texto vira scanned', async () => {
    install();
    const pages = Array.from({ length: 5 }, () => 'p. 3').join('\f');
    const out = await convertDocument(path.join(base, 'b.pdf'), fakeRun(pages));
    expect(out.scanned).toBe(true);
    const docx = await convertDocument(path.join(base, 'c.docx'), fakeRun('curto'));
    expect(docx.scanned).toBe(false);
  });

  it('sem o executável lança SEM_MARKITDOWN', async () => {
    expect(markitdownReady()).toBe(false);
    await expect(convertDocument(path.join(base, 'a.pdf'), fakeRun('x'))).rejects.toMatchObject({
      code: 'SEM_MARKITDOWN',
      message: expect.stringContaining('docs/guia/instalacao.md'),
    });
  });

  it('tempo esgotado vira AppError em português', async () => {
    install();
    const run = vi.fn(async () => {
      throw new AppError(504, 'LOCAL_TIMEOUT', 'x');
    });
    await expect(convertDocument(path.join(base, 'a.pdf'), run)).rejects.toMatchObject({
      code: 'CONVERSAO_DEMORADA',
      message: expect.stringMatching(/documento/),
    });
  });
});
