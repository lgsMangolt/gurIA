import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error script .mjs sem tipos
import { scanSeams } from '../../scripts/import-graph.mjs';

const root = path.resolve(__dirname, '..', '..');

// Fim da fase 4: o código de estudo não importa nada de fora dele.
const ALLOWED_SEAMS: string[] = [];
const ALLOWED_PACKAGES: string[] = [];
const tracked = () =>
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs|cjs)$/;

describe('importações do OpenMAIC no código de estudo', () => {
  it('as costuras do código de estudo são exatamente as permitidas', () => {
    const found = scanSeams(root);
    expect(found.seams).toEqual([...ALLOWED_SEAMS].sort());
    expect(found.packages).toEqual([...ALLOWED_PACKAGES].sort());
  });

  it('uma costura nova é detectada', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-seams-'));
    try {
      fs.mkdirSync(path.join(tmp, 'lib', 'study'), { recursive: true });
      fs.mkdirSync(path.join(tmp, 'lib', 'server'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'lib', 'server', 'algo.ts'), 'export const x = 1;\n');
      fs.writeFileSync(
        path.join(tmp, 'lib', 'study', 'novo.ts'),
        "import { x } from '@/lib/server/algo';\nimport '@openmaic/dsl';\nexport const y = x;\n",
      );
      const found = scanSeams(tmp);
      expect(found.seams).toEqual(['lib/study/novo.ts -> lib/server/algo.ts']);
      expect(found.packages).toEqual(['lib/study/novo.ts -> @openmaic/dsl']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('nenhum arquivo do projeto importa @openmaic/*', () => {
    const offenders = tracked()
      // Este arquivo cita '@openmaic/dsl' num texto de exemplo (teste acima).
      .filter((f) => SOURCE.test(f) && f !== 'tests/study/no-openmaic-imports.test.ts')
      .filter((f) => fs.existsSync(path.join(root, f)))
      .filter((f) =>
        /(from\s+|import\s*\(\s*|require\(\s*|import\s+)['"]@openmaic\//.test(
          fs.readFileSync(path.join(root, f), 'utf8'),
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('o código do app só existe nas pastas da gurIA', () => {
    const allowed = /^(app\/(study|api\/study)\/|app\/(layout\.tsx|globals\.css|favicon\.ico|apple-icon\.png)$|components\/study\/|lib\/study\/)/;
    const outside = tracked().filter(
      (f) => /^(app|components|lib)\//.test(f) && !allowed.test(f) && fs.existsSync(path.join(root, f)),
    );
    expect(outside).toEqual([]);
  });
});
