import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../runtime/analysis';

export type SkillsConfig = { mode: 'separate' | 'in-repo'; repoPath: string };
const FILE = 'skills-config.json';
const schema = z.object({ mode: z.enum(['separate', 'in-repo']), repoPath: z.string().min(1) });
const invalid = (message: string) => new AppError(400, 'DESTINO_INVALIDO', message);

export function loadSkillsConfig(root: string): SkillsConfig | null {
  try {
    return schema.parse(JSON.parse(fs.readFileSync(path.join(root, FILE), 'utf8')));
  } catch {
    return null;
  }
}

const WIN = process.platform === 'win32';
const norm = (p: string) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const inside = (parent: string, child: string) => {
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const real = (p: string) => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
};
/** Compara caminhos ignorando caixa no Windows e nomes curtos (8.3). */
export const samePath = (a: string, b: string) => norm(real(a)) === norm(real(b));

/** Valida o destino sem gravar nada. */
export function validateDestination(
  input: { mode: 'separate' | 'in-repo'; repoPath?: string },
  appRoot: string,
): SkillsConfig {
  const app = path.resolve(appRoot);
  if (input.mode === 'in-repo')
    return { mode: 'in-repo', repoPath: path.join(app, 'skills-geradas') };
  const given = input.repoPath?.trim();
  if (!given || !path.isAbsolute(given))
    throw invalid(
      'Informe o caminho completo da pasta do repositório (por exemplo, C:\\Users\\voce\\minhas-skills).',
    );
  const repoPath = path.resolve(given);
  let isDir = false;
  try {
    isDir = fs.statSync(repoPath).isDirectory();
  } catch {}
  if (!isDir)
    throw invalid('Essa pasta não existe. Crie a pasta do repositório antes de escolher.');
  if (path.parse(repoPath).root === repoPath)
    throw invalid('Não use a raiz do disco como destino.');
  if (repoPath.split(path.sep).includes('node_modules'))
    throw invalid('Não use uma pasta dentro de node_modules.');
  if (inside(app, repoPath))
    throw invalid(
      'Use uma pasta fora da gurIA. Para guardar dentro do projeto, escolha a opção skills-geradas/.',
    );
  const home = os.homedir();
  const common = ['Desktop', 'Documents', 'Downloads'].map((d) => path.join(home, d));
  if (inside(repoPath, home) || common.some((d) => samePath(repoPath, d)))
    throw invalid(
      'Escolha uma pasta própria para as skills, não a sua pasta pessoal nem Documentos/Desktop.',
    );
  return { mode: 'separate', repoPath };
}

export function saveSkillsConfig(
  root: string,
  input: { mode: 'separate' | 'in-repo'; repoPath?: string },
  appRoot: string,
): SkillsConfig {
  const config = validateDestination(input, appRoot);
  if (config.mode === 'in-repo') fs.mkdirSync(config.repoPath, { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, FILE), JSON.stringify(config, null, 2));
  return config;
}
