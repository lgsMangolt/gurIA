// Leitura de fontes locais só dentro da pasta ou do arquivo que o dono escolheu.
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../runtime/analysis';

/** Caminho real de `candidate`, desde que esteja dentro de `root` (ou seja a própria raiz). */
export async function insideRoot(root: string, candidate: string): Promise<string> {
  const base = await fs.promises.realpath(root);
  let real: string;
  try {
    real = await fs.promises.realpath(candidate);
  } catch {
    throw new AppError(
      404,
      'FONTE_AUSENTE',
      `Arquivo não encontrado: ${path.basename(candidate)}.`,
    );
  }
  const rel = path.relative(base, real);
  if (rel.startsWith('..') || path.isAbsolute(rel))
    throw new AppError(400, 'FORA_DA_PASTA', 'O arquivo está fora da pasta escolhida.');
  return real;
}
