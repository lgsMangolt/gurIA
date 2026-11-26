import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { studyRoot } from '@/lib/study/storage-root';

const root = path.resolve(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), 'utf8');
const owner = 'study-local';
const hash = createHash('sha256').update(owner).digest('hex');

let base: string;
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-root-'));
});
afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe('pasta de dados da gurIA', () => {
  it('usa gurIA/Estudos/<hash do proprietário> e a cria vazia quando não há nada antigo', () => {
    const dir = studyRoot(base, owner);
    expect(dir).toBe(path.join(base, 'gurIA', 'Estudos', hash));
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('copia a pasta antiga OpenMAIC-Estudos uma vez e mantém a original intacta', () => {
    const legacy = path.join(base, 'OpenMAIC-Estudos', hash);
    fs.mkdirSync(path.join(legacy, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(legacy, 'model.json'), '{"harness":"codex"}');
    fs.writeFileSync(path.join(legacy, 'sub', 'a.txt'), 'material');

    const dir = studyRoot(base, owner);

    expect(fs.readFileSync(path.join(dir, 'model.json'), 'utf8')).toBe('{"harness":"codex"}');
    expect(fs.readFileSync(path.join(dir, 'sub', 'a.txt'), 'utf8')).toBe('material');
    expect(fs.readFileSync(path.join(legacy, 'model.json'), 'utf8')).toBe('{"harness":"codex"}');
  });

  it('não sobrescreve a pasta nova quando ela já existe', () => {
    const legacy = path.join(base, 'OpenMAIC-Estudos', hash);
    const current = path.join(base, 'gurIA', 'Estudos', hash);
    fs.mkdirSync(legacy, { recursive: true });
    fs.mkdirSync(current, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'model.json'), 'antigo');
    fs.writeFileSync(path.join(current, 'model.json'), 'novo');

    studyRoot(base, owner);

    expect(fs.readFileSync(path.join(current, 'model.json'), 'utf8')).toBe('novo');
  });

  it('o serviço usa o helper e não cita mais o nome antigo da pasta', () => {
    const service = read('lib', 'study', 'service.ts');
    expect(service).toContain('studyRoot(');
    expect(service).not.toContain("'OpenMAIC-Estudos'");
  });
});

describe('launchers apontam para o projeto Docker guria-db', () => {
  it('guria-desktop.mjs e start-study.ps1 usam guria-db', () => {
    for (const file of ['guria-desktop.mjs', 'start-study.ps1']) {
      const text = read('scripts', file);
      expect(text, file).toContain('guria-db');
      expect(text, file).not.toContain('openmaic-study-db');
    }
  });
});
