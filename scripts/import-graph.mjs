// Grafo de importações do código da gurIA (somente leitura).
// Uso: node scripts/import-graph.mjs [raiz] [--json] [--reach entrada1 entrada2 ...]
//  - sem --reach: imprime as "costuras" (imports diretos do código de estudo para fora dele);
//  - com --reach: imprime os arquivos e pacotes alcançados a partir das entradas.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ts = createRequire(import.meta.url)('typescript');
const EXTS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];
const BUILTIN = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'child_process',
  'stream',
  'url',
  'util',
  'events',
  'http',
  'https',
  'net',
  'zlib',
  'buffer',
  'readline',
  'assert',
  'tty',
  'module',
  'worker_threads',
  'perf_hooks',
  'dns',
  'vm',
]);
export const STUDY_DIRS = ['components/study', 'lib/study', 'app/study', 'app/api/study'];

const norm = (p) => p.replace(/\\/g, '/');
function resolveFile(base) {
  for (const c of [
    base,
    ...EXTS.map((e) => base + e),
    ...EXTS.map((e) => path.join(base, 'index' + e)),
  ])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
function specsOf(text) {
  const specs = ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName);
  for (const m of text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]);
  return specs;
}
function packageOf(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}
/** Resolve um especificador a um arquivo do projeto ou a um nome de pacote. */
function resolveSpec(root, spec, from) {
  if (spec.startsWith('node:') || BUILTIN.has(spec)) return {};
  if (spec.startsWith('.')) return { file: resolveFile(path.resolve(path.dirname(from), spec)) };
  if (spec.startsWith('@/')) return { file: resolveFile(path.join(root, spec.slice(2))) };
  return { pkg: packageOf(spec) };
}
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.next')) continue;
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts|jsx?|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}
const isStudy = (rel) => STUDY_DIRS.some((d) => rel.startsWith(d + '/'));

/** Costuras: imports diretos de arquivos de estudo para arquivos fora deles, e pacotes @openmaic. */
export function scanSeams(root) {
  const seams = [];
  const packages = [];
  for (const dir of STUDY_DIRS) {
    for (const file of walk(path.join(root, dir))) {
      const from = norm(path.relative(root, file));
      for (const spec of specsOf(fs.readFileSync(file, 'utf8'))) {
        const r = resolveSpec(root, spec, file);
        if (r.file) {
          const to = norm(path.relative(root, r.file));
          if (!isStudy(to)) seams.push(`${from} -> ${to}`);
        } else if (r.pkg?.startsWith('@openmaic/')) packages.push(`${from} -> ${r.pkg}`);
      }
    }
  }
  return { seams: [...new Set(seams)].sort(), packages: [...new Set(packages)].sort() };
}

/** Alcance: tudo que as entradas importam, direta ou indiretamente. */
export function reach(root, entries) {
  const seen = new Set();
  const queue = [];
  const externals = new Map();
  const add = (file) => {
    if (!seen.has(file)) {
      seen.add(file);
      queue.push(file);
    }
  };
  for (const entry of entries) {
    const abs = path.join(root, entry);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs).forEach(add);
    else add(abs);
  }
  while (queue.length) {
    const file = queue.pop();
    if (!/\.(tsx?|mts|jsx?|mjs)$/.test(file)) continue;
    for (const spec of specsOf(fs.readFileSync(file, 'utf8'))) {
      const r = resolveSpec(root, spec, file);
      if (r.file) add(r.file);
      else if (r.pkg) {
        if (!externals.has(r.pkg)) externals.set(r.pkg, new Set());
        externals.get(r.pkg).add(norm(path.relative(root, file)));
      }
    }
  }
  return {
    files: [...seen].map((f) => norm(path.relative(root, f))).sort(),
    packages: [...externals.keys()].sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const reachAt = args.indexOf('--reach');
  const rest = args.filter((a) => a !== '--json');
  const root = path.resolve(
    rest[0] && !rest[0].startsWith('--')
      ? rest[0]
      : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  if (reachAt !== -1) {
    const entries = args.slice(reachAt + 1).filter((a) => a !== '--json');
    const result = reach(root, entries);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Arquivos alcançados: ${result.files.length}`);
      console.log(`Pacotes externos (${result.packages.length}): ${result.packages.join(', ')}`);
    }
  } else {
    const result = scanSeams(root);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('Costuras do código de estudo:');
      for (const s of result.seams) console.log('  ' + s);
      console.log('Pacotes @openmaic importados direto:');
      for (const s of result.packages) console.log('  ' + s);
    }
  }
}
