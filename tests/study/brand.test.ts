import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  BACKUP_FORMAT,
  isKnownAppName,
  isKnownBackupFormat,
  resolveStudyLocal,
} from '@/lib/study/brand';

const root = resolve(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8');

describe('nome gurIA com compatibilidade', () => {
  it('o nome atual é gurIA e o formato de backup novo é gurIA-v1', () => {
    expect(APP_NAME).toBe('gurIA');
    expect(BACKUP_FORMAT).toBe('gurIA-v1');
  });

  it('reconhece o nome novo e o antigo, e recusa outros apps', () => {
    expect(isKnownAppName('gurIA')).toBe(true);
    expect(isKnownAppName('OpenMAIC Estudos')).toBe(true);
    expect(isKnownAppName('Outro app')).toBe(false);
    expect(isKnownAppName(undefined)).toBe(false);
  });

  it('importa backups no formato novo e no antigo, e recusa outros', () => {
    expect(isKnownBackupFormat('gurIA-v1')).toBe(true);
    expect(isKnownBackupFormat('openmaic-study-v1')).toBe(true);
    expect(isKnownBackupFormat('qualquer-coisa')).toBe(false);
    expect(isKnownBackupFormat(undefined)).toBe(false);
  });
});

describe('GURIA_LOCAL com fallback para OPENMAIC_STUDY_LOCAL', () => {
  it('sem nenhuma variável, o modo local fica desligado', () => {
    expect(resolveStudyLocal({})).toBe('false');
  });
  it('aceita a variável antiga', () => {
    expect(resolveStudyLocal({ OPENMAIC_STUDY_LOCAL: 'true' })).toBe('true');
  });
  it('aceita a variável nova', () => {
    expect(resolveStudyLocal({ GURIA_LOCAL: 'true' })).toBe('true');
  });
  it('a nova vence a antiga quando as duas existem', () => {
    expect(resolveStudyLocal({ GURIA_LOCAL: 'false', OPENMAIC_STUDY_LOCAL: 'true' })).toBe('false');
  });
  it('GURIA_LOCAL vazia cai para a antiga', () => {
    expect(resolveStudyLocal({ GURIA_LOCAL: '', OPENMAIC_STUDY_LOCAL: 'true' })).toBe('true');
  });
});

describe('o nome novo está ligado ao app e aos scripts', () => {
  it('health, exportação e importação usam os helpers', () => {
    expect(read('app', 'api', 'study', '[...path]', 'route.ts')).toContain('app: APP_NAME');
    const study = read('components', 'study', 'StudyApp.tsx');
    expect(study).toContain('format: BACKUP_FORMAT');
    expect(study).toContain('isKnownBackupFormat(backup.format)');
  });

  it('os launchers aceitam o nome novo e o antigo no health', () => {
    for (const file of [
      ['scripts', 'guria-desktop.mjs'],
      ['scripts', 'start-study.ps1'],
      ['scripts', 'readme-demo', 'up.mjs'],
    ]) {
      const text = read(...file);
      expect(text, file.join('/')).toContain('gurIA');
      expect(text, file.join('/')).toContain('OpenMAIC Estudos');
    }
  });

  it('textos do app não dizem mais "OpenMAIC Estudos"', () => {
    for (const file of [
      ['lib', 'study', 'startup.ts'],
      ['lib', 'study', 'runtime', 'codex.ts'],
      ['app', 'study', 'study.css'],
    ])
      expect(read(...file), file.join('/')).not.toContain('OpenMAIC Estudos');
  });

  it('a demo e os guias usam GURIA_LOCAL', () => {
    expect(read('scripts', 'readme-demo', 'up.mjs')).toContain("GURIA_LOCAL: 'true'");
    for (const file of [['.env.example'], ['docs', 'guia', 'instalacao.md']])
      expect(read(...file), file.join('/')).toContain('GURIA_LOCAL=true');
  });
});

describe('arquivo de backup', () => {
  it('é baixado com o nome da gurIA, não com o nome antigo', () => {
    const app = read('components', 'study', 'StudyApp.tsx');
    expect(app).toContain("a.download = 'gurIA-estudos.json'");
    expect(app).not.toContain('openmaic-estudos');
  });
});
