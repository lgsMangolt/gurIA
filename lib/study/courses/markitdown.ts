// Conversão de PDF, DOCX e PPTX em Markdown com o Microsoft MarkItDown (Python),
// instalado por scripts/install-markitdown.ps1 em %LOCALAPPDATA%\CognitiveStudyHubTools\markitdown.
// Roda local, sem IA. Não é usado para YouTube nem para OCR.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../runtime/analysis';
import { runLocal } from '../runtime/media';

const TIMEOUT = 120000;

export function markitdownPath(): string {
  const root = process.env.LOCALAPPDATA || os.homedir();
  const exe = path.join(root, 'CognitiveStudyHubTools', 'markitdown', 'Scripts', 'markitdown.exe');
  return fs.existsSync(exe) ? exe : '';
}

export function markitdownReady(): boolean {
  return !!markitdownPath();
}

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** PDF escaneado: quase sem texto, menos de 5 palavras por página em média (páginas separadas por form feed). */
function looksScanned(file: string, markdown: string, words: number): boolean {
  if (path.extname(file).toLowerCase() !== '.pdf') return false;
  const pages = markdown.split('\f').length;
  return words / pages < 5;
}

export async function convertDocument(
  file: string,
  run: typeof runLocal = runLocal,
): Promise<{ markdown: string; scanned: boolean; words: number }> {
  const exe = markitdownPath();
  if (!exe)
    throw new AppError(
      503,
      'SEM_MARKITDOWN',
      'Para importar PDF, DOCX ou PPTX instale o conversor: veja docs/guia/instalacao.md.',
    );
  // Saída em arquivo (UTF-8): o console do Windows trocaria caracteres como 汉字.
  const out = path.join(os.tmpdir(), `guria-md-${randomUUID()}.md`);
  try {
    await run(exe, [file, '-o', out], TIMEOUT);
    const markdown = fs.readFileSync(out, 'utf8');
    const words = countWords(markdown);
    return { markdown, words, scanned: looksScanned(file, markdown, words) };
  } catch (e) {
    if (e instanceof AppError && e.code === 'LOCAL_TIMEOUT')
      throw new AppError(
        504,
        'CONVERSAO_DEMORADA',
        'A conversão do documento passou de 2 minutos e foi interrompida.',
      );
    if (e instanceof AppError && e.code === 'LOCAL_TOOL_MISSING') throw e;
    throw new AppError(
      422,
      'CONVERSAO_FALHOU',
      `Não foi possível ler o documento ${path.basename(file)}. Ele pode estar protegido ou corrompido.`,
    );
  } finally {
    fs.rmSync(out, { force: true });
  }
}
