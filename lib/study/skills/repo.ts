import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../runtime/analysis';
import { parseSkillMd } from './content';
import { validateSkillName } from './names';

const ALLOWED = /^(SKILL\.md|README\.md|\.guria\/manifest\.json|references\/[A-Za-z0-9._-]+\.md)$/;
const MANIFEST_REL = '.guria/manifest.json';
export const isSkillPath = (rel: string): boolean => ALLOWED.test(rel);

const manifestSchema = z.object({
  schema: z.literal('gurIA-skill-v1'),
  slug: z.string(),
  name: z.string(),
  version: z.number().int().min(1),
  updatedAt: z.string(),
  concepts: z.array(z.object({ id: z.string() }).passthrough()),
});

const invalid = (message: string) => new AppError(400, 'CAMINHO_INVALIDO', message);

export function listSkills(dir: string) {
  const out: {
    slug: string;
    name: string;
    version: number;
    updatedAt: string;
    count: number;
    description: string;
    conceptIds: string[];
  }[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    try {
      const manifest = manifestSchema.parse(
        JSON.parse(fs.readFileSync(path.join(dir, entry.name, MANIFEST_REL), 'utf8')),
      );
      if (manifest.slug !== entry.name) continue;
      let description = '';
      try {
        description =
          parseSkillMd(fs.readFileSync(path.join(dir, entry.name, 'SKILL.md'), 'utf8'))
            ?.description ?? '';
      } catch {}
      out.push({
        slug: manifest.slug,
        name: manifest.name,
        version: manifest.version,
        updatedAt: manifest.updatedAt,
        count: manifest.concepts.length,
        conceptIds: manifest.concepts.map((c) => c.id),
        description,
      });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

export function readSkillFiles(dir: string, slug: string): Record<string, string> | null {
  if (validateSkillName(slug)) return null;
  const root = path.join(dir, slug);
  if (!fs.existsSync(root)) return null;
  const files: Record<string, string> = {};
  const take = (rel: string) => {
    try {
      files[rel] = fs
        .readFileSync(path.join(root, ...rel.split('/')), 'utf8')
        .replace(/\r\n/g, '\n');
    } catch {}
  };
  for (const rel of ['SKILL.md', 'README.md', MANIFEST_REL]) take(rel);
  try {
    for (const name of fs.readdirSync(path.join(root, 'references')))
      if (ALLOWED.test('references/' + name)) take('references/' + name);
  } catch {}
  return files;
}

export async function writeSkill(args: {
  dir: string;
  slug: string;
  files: Record<string, string>;
  removeStale?: string[];
  /** Sem rootReadme, o README da raiz não é tocado (o dono já tinha o dele). */
  rootReadme?: string;
  rootReadmePath?: string;
}): Promise<{ touched: string[]; rollback: () => Promise<void> }> {
  const { dir, slug, files } = args;
  const nameError = validateSkillName(slug);
  if (nameError) throw invalid(nameError);
  const rootReadmePath = args.rootReadmePath ?? 'README.md';
  if (rootReadmePath !== 'README.md')
    throw invalid('O índice da raiz precisa se chamar README.md.');
  const skillRoot = path.resolve(dir, slug);
  const resolveRel = (rel: string) => {
    if (!ALLOWED.test(rel)) throw invalid(`Arquivo não permitido na skill: ${rel}`);
    const abs = path.resolve(skillRoot, ...rel.split('/'));
    if (!abs.startsWith(skillRoot + path.sep))
      throw invalid(`Caminho fora da pasta da skill: ${rel}`);
    return abs;
  };

  // Tudo é validado antes de qualquer gravação.
  const writes = Object.entries(files).map(([rel, content]) => ({
    rel: `${slug}/${rel}`,
    abs: resolveRel(rel),
    content,
  }));
  const stale = (args.removeStale ?? []).map((rel) => ({
    rel: `${slug}/${rel}`,
    abs: resolveRel(rel),
  }));
  if (args.rootReadme !== undefined)
    writes.push({
      rel: rootReadmePath,
      abs: path.resolve(dir, rootReadmePath),
      content: args.rootReadme,
    });

  // Links simbólicos e junctions: o caminho real de cada destino precisa continuar dentro de `dir`.
  const WIN = process.platform === 'win32';
  const key = (p: string) => (WIN ? p.toLowerCase() : p);
  const realDir = fs.realpathSync(path.resolve(dir));
  const guard = (abs: string) => {
    let existing = abs;
    while (!fs.existsSync(existing) && existing !== path.dirname(existing))
      existing = path.dirname(existing);
    const real = fs.realpathSync(existing);
    if (key(real) !== key(realDir) && !key(real).startsWith(key(realDir) + path.sep))
      throw invalid(
        'Esta pasta aponta para fora do destino (link simbólico). Remova o link e tente de novo.',
      );
  };
  guard(skillRoot);
  for (const { abs } of [...writes, ...stale]) guard(path.dirname(abs));

  const snapshots = new Map<string, string | null>();
  for (const { abs } of [...writes, ...stale])
    if (!snapshots.has(abs))
      snapshots.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null);

  const created: string[] = [];
  const ensureDir = (target: string) => {
    const chain: string[] = [];
    let current = target;
    while (!fs.existsSync(current) && current !== path.dirname(current)) {
      chain.unshift(current);
      current = path.dirname(current);
    }
    for (const d of chain) {
      fs.mkdirSync(d);
      created.push(d);
    }
  };
  const rollback = async () => {
    for (const [abs, old] of snapshots) {
      try {
        if (old === null) fs.rmSync(abs, { force: true });
        else fs.writeFileSync(abs, old);
      } catch {}
    }
    for (const d of [...created].reverse()) {
      try {
        fs.rmdirSync(d);
      } catch {}
    }
  };
  try {
    for (const { abs, content } of writes) {
      ensureDir(path.dirname(abs));
      fs.writeFileSync(abs, content);
    }
    for (const { abs } of stale)
      if (!writes.some((w) => w.abs === abs)) fs.rmSync(abs, { force: true });
  } catch (error) {
    await rollback();
    throw error;
  }
  return { touched: writes.map((w) => w.rel), rollback };
}
