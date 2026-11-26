// Configurações, scripts do package.json e guias não podem apontar para
// arquivos ou pastas que não existem mais (o OpenMAIC saiu na fase 4).
import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
// Imports sem extensão ("./lib/study/brand") também contam.
const exists = (p: string) =>
  ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts'].some((ext) =>
    fs.existsSync(path.join(root, p + ext)),
  );
// Parte fixa de um padrão de glob ("lib/study/**/*.ts" -> "lib/study").
const staticPart = (p: string) =>
  p
    .replace(/^\.\//, '')
    .split('/')
    .filter((_, i, all) => !all.slice(0, i + 1).some((s) => /[*?{[]/.test(s)))
    .join('/');
const missing = (refs: string[]) =>
  [...new Set(refs)].filter((r) => {
    const fixed = staticPart(r);
    return fixed !== '' && !exists(fixed);
  });

it('tsconfig*.json só incluem caminhos que existem', () => {
  for (const file of ['tsconfig.json', 'tsconfig.study.json']) {
    // Os tsconfig têm comentários e vírgulas finais só em alguns casos; JSON puro aqui.
    const config = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const refs = [...(config.include ?? []), ...(config.files ?? [])].filter(
      // next-env.d.ts é gerado pelo Next na primeira execução e fica fora do git.
      (r: string) => !r.startsWith('.next') && !r.startsWith('**') && r !== 'next-env.d.ts',
    );
    expect(missing(refs), file).toEqual([]);
  }
});

it('vitest*.config.ts e next.config.ts só citam caminhos que existem', () => {
  const files = fs.readdirSync(root).filter((f) => /^vitest.*\.config\.ts$/.test(f));
  for (const file of [...files, 'next.config.ts']) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    const refs = [
      ...src.matchAll(
        /['"`]\.?\/?((?:tests|lib|app|scripts|components|packages|e2e|eval)\/[^'"`]*)['"`]/g,
      ),
    ].map((m) => m[1]);
    expect(missing(refs), file).toEqual([]);
  }
});

it('os scripts do package.json só chamam arquivos que existem', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const refs = Object.values<string>(pkg.scripts ?? {}).flatMap((cmd) => [
    ...[
      ...cmd.matchAll(/(?:^|[\s=])((?:\.\/)?(?:scripts|packages|eval|e2e|tests)\/[^\s&|;]+)/g),
    ].map((m) => m[1]),
    ...[...cmd.matchAll(/(?:-f|--config)\s+([^\s&|;]+)/g)].map((m) => m[1]),
  ]);
  expect(missing(refs)).toEqual([]);
});

it('os guias só citam arquivos e links locais que existem', () => {
  const dir = path.join(root, 'docs', 'guia');
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const links = [...text.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)].map((m) =>
      path.posix.join('docs/guia', m[1]),
    );
    const code = [
      ...text.matchAll(/`((?:scripts|lib|app|components|tests|docs|public)\/[^`\s]+)`/g),
    ].map((m) => m[1]);
    expect(missing([...links, ...code]), file).toEqual([]);
  }
});
