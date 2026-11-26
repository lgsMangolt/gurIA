import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSkillsConfig, samePath, saveSkillsConfig } from '@/lib/study/skills/config';
import {
  commitPaths,
  defaultRemotePolicy,
  gitAvailable,
  hasIdentity,
  initRepo,
  isRepo,
  pushBranch,
  redactUrl,
  remoteInfo,
  repoTopLevel,
} from '@/lib/study/skills/git';
import { listSkills, readSkillFiles, writeSkill } from '@/lib/study/skills/repo';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-skills-test-'));
const emptyGlobal = path.join(tmp, 'gitconfig-vazio');
const saved: Record<string, string | undefined> = {};
const code = (c: string) => expect.objectContaining({ code: c });
let counter = 0;

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const newDir = (name = 'dir') => {
  const dir = path.join(tmp, `${name}-${++counter}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const newRepo = (identity = true) => {
  const dir = newDir('repo');
  git(dir, 'init', '-q', '-b', 'main');
  if (identity) {
    git(dir, 'config', 'user.name', 'Teste');
    git(dir, 'config', 'user.email', 'teste@example.test');
  }
  return dir;
};
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const manifest = (slug: string, version = 1) =>
  JSON.stringify({
    schema: 'gurIA-skill-v1',
    slug,
    name: 'Nome ' + slug,
    version,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    includeAnswers: false,
    concepts: [{ id: 'a', label: 'Alfa', hash: 'h', file: 'references/alfa-1234.md' }],
  });
const skillFiles = (slug: string, version = 1) => ({
  'SKILL.md': `---\nname: ${slug}\ndescription: "Use quando precisar de ${slug}."\n---\n\n# ${slug}\n`,
  'README.md': '# ' + slug + '\n',
  'references/alfa-1234.md': '# Alfa\n',
  '.guria/manifest.json': manifest(slug, version),
});

beforeAll(() => {
  fs.writeFileSync(emptyGlobal, '');
  for (const key of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']) saved[key] = process.env[key];
  process.env.GIT_CONFIG_GLOBAL = emptyGlobal; // o teste não depende da identidade da máquina
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterAll(() => {
  for (const [key, value] of Object.entries(saved))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('configuração do destino', () => {
  it('salva e relê; in-repo aponta para skills-geradas', () => {
    const root = newDir('dados');
    const app = newDir('app');
    const target = newDir('destino');
    expect(loadSkillsConfig(root)).toBeNull();
    const sep = saveSkillsConfig(root, { mode: 'separate', repoPath: target }, app);
    expect(sep).toEqual({ mode: 'separate', repoPath: path.resolve(target) });
    expect(loadSkillsConfig(root)).toEqual(sep);
    const inRepo = saveSkillsConfig(root, { mode: 'in-repo' }, app);
    expect(inRepo.repoPath).toBe(path.join(app, 'skills-geradas'));
    expect(fs.existsSync(inRepo.repoPath)).toBe(true);
  });
  it('recusa caminho relativo, inexistente, raiz do disco, skills/ do app, node_modules e o próprio app', () => {
    const root = newDir('dados');
    const app = newDir('app');
    fs.mkdirSync(path.join(app, 'skills'));
    fs.mkdirSync(path.join(app, 'node_modules', 'x'), { recursive: true });
    const bad = (repoPath?: string) =>
      expect(() => saveSkillsConfig(root, { mode: 'separate', repoPath }, app)).toThrow();
    bad(undefined);
    bad('relativo/pasta');
    bad(path.join(tmp, 'nao-existe'));
    bad(path.parse(tmp).root);
    bad(path.join(app, 'skills'));
    bad(path.join(app, 'node_modules', 'x'));
    bad(app);
    expect(loadSkillsConfig(root)).toBeNull();
  });
});

describe('política de remoto', () => {
  it('aceita só GitHub e recusa o OpenMAIC em qualquer grafia', () => {
    expect(defaultRemotePolicy('https://github.com/fulano/skills.git')).toBeNull();
    expect(defaultRemotePolicy('git@github.com:fulano/skills')).toBeNull();
    for (const url of [
      'http://github.com/fulano/skills',
      'https://gitlab.com/fulano/skills',
      'https://github.com/THU-MAIC/OpenMAIC',
      'https://github.com/thu-maic/openmaic.git',
      'git@github.com:THU-MAIC/OpenMAIC.git',
      '/caminho/local',
    ])
      expect(defaultRemotePolicy(url), url).toEqual(expect.any(String));
  });
});

describe('gravação com rollback', () => {
  it('grava, cria o README raiz e o rollback devolve o estado anterior', async () => {
    const dir = newDir('destino');
    fs.mkdirSync(path.join(dir, 'sk', 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sk', 'SKILL.md'), 'ANTIGO');
    fs.writeFileSync(path.join(dir, 'sk', 'references', 'velho-0000.md'), 'REFERÊNCIA VELHA');
    fs.writeFileSync(path.join(dir, 'README.md'), 'RAIZ ANTIGA');
    const files = skillFiles('sk');
    const result = await writeSkill({
      dir,
      slug: 'sk',
      files,
      removeStale: ['references/velho-0000.md'],
      rootReadme: 'RAIZ NOVA',
    });
    expect(read(dir, 'sk', 'SKILL.md')).toBe(files['SKILL.md']);
    expect(read(dir, 'README.md')).toBe('RAIZ NOVA');
    expect(fs.existsSync(path.join(dir, 'sk', 'references', 'velho-0000.md'))).toBe(false);
    expect(result.touched).toContain('sk/SKILL.md');
    expect(result.touched).toContain('README.md');
    await result.rollback();
    expect(read(dir, 'sk', 'SKILL.md')).toBe('ANTIGO');
    expect(read(dir, 'sk', 'references', 'velho-0000.md')).toBe('REFERÊNCIA VELHA');
    expect(read(dir, 'README.md')).toBe('RAIZ ANTIGA');
    expect(fs.existsSync(path.join(dir, 'sk', '.guria'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'sk', 'references', 'alfa-1234.md'))).toBe(false);
  });
  it('skill nova: o rollback não deixa pasta residual', async () => {
    const dir = newDir('destino');
    const result = await writeSkill({
      dir,
      slug: 'nova',
      files: skillFiles('nova'),
      rootReadme: 'R',
    });
    expect(fs.existsSync(path.join(dir, 'nova', 'SKILL.md'))).toBe(true);
    await result.rollback();
    expect(fs.existsSync(path.join(dir, 'nova'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'README.md'))).toBe(false);
  });
  it('caminhos fora da pasta da skill e nomes inválidos são recusados sem gravar nada', async () => {
    const dir = newDir('destino');
    const base = skillFiles('sk');
    for (const bad of [
      '../x.md',
      '/etc/x.md',
      'C:\\x.md',
      'references/../../x.md',
      'scripts/x.sh',
      'SKILL.md/../../x',
      'references\\..\\x.md',
    ])
      await expect(
        writeSkill({ dir, slug: 'sk', files: { ...base, [bad]: 'x' }, rootReadme: 'R' }),
      ).rejects.toBeDefined();
    await expect(
      writeSkill({ dir, slug: 'sk', files: base, removeStale: ['../fora.md'], rootReadme: 'R' }),
    ).rejects.toBeDefined();
    for (const slug of ['..', 'a/b', 'Con', 'con', ''])
      await expect(writeSkill({ dir, slug, files: base, rootReadme: 'R' })).rejects.toBeDefined();
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('listSkills e readSkillFiles leem manifestos válidos e ignoram os inválidos', async () => {
    const dir = newDir('destino');
    await writeSkill({ dir, slug: 'boa', files: skillFiles('boa', 3), rootReadme: 'R' });
    fs.mkdirSync(path.join(dir, 'sem-manifesto'));
    fs.mkdirSync(path.join(dir, 'quebrada', '.guria'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'quebrada', '.guria', 'manifest.json'), '{nao é json');
    const list = listSkills(dir);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: 'boa', version: 3, count: 1 });
    expect(list[0].description).toContain('boa');
    const files = readSkillFiles(dir, 'boa')!;
    expect(Object.keys(files).sort()).toEqual(
      ['.guria/manifest.json', 'README.md', 'SKILL.md', 'references/alfa-1234.md'].sort(),
    );
    expect(readSkillFiles(dir, 'nao-existe')).toBeNull();
  });
});

describe('git', () => {
  it('git está disponível neste ambiente', async () => {
    expect(await gitAvailable()).toBe(true);
  });
  it('isRepo e initRepo', async () => {
    const dir = newDir('semrepo');
    expect(await isRepo(dir)).toBe(false);
    await initRepo(dir);
    expect(await isRepo(dir)).toBe(true);
  });
  it('commitPaths leva só os caminhos da skill e preserva a alteração do dono', async () => {
    const repo = newRepo();
    fs.writeFileSync(path.join(repo, 'outro.txt'), 'v1');
    git(repo, 'add', 'outro.txt');
    git(repo, 'commit', '-q', '-m', 'base');
    fs.writeFileSync(path.join(repo, 'outro.txt'), 'v2 do dono');
    git(repo, 'add', 'outro.txt'); // alteração do dono já no índice
    const w = await writeSkill({
      dir: repo,
      slug: 'sk',
      files: skillFiles('sk'),
      rootReadme: 'RAIZ',
    });
    const { hash } = await commitPaths(repo, w.touched, 'skill(sk): v1');
    expect(hash).toMatch(/^[0-9a-f]{7,40}$/);
    const files = git(repo, 'show', '--name-only', '--pretty=format:%s', 'HEAD').split('\n');
    expect(files[0]).toBe('skill(sk): v1');
    expect(files.slice(1).sort()).toEqual(
      [
        'README.md',
        'sk/.guria/manifest.json',
        'sk/README.md',
        'sk/SKILL.md',
        'sk/references/alfa-1234.md',
      ].sort(),
    );
    expect(git(repo, 'status', '--porcelain')).toContain('outro.txt');
    expect(git(repo, 'diff', '--cached', '--name-only')).toBe('outro.txt');
  });
  it('sem identidade falha com GIT_SEM_IDENTIDADE e o rollback deixa a árvore como estava', async () => {
    const repo = newRepo(false);
    expect(await hasIdentity(repo)).toBe(false);
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await expect(commitPaths(repo, w.touched, 'x')).rejects.toMatchObject({
      code: 'GIT_SEM_IDENTIDADE',
    });
    await w.rollback();
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(fs.existsSync(path.join(repo, 'sk'))).toBe(false);
  });
  it('nada a commitar falha com NADA_A_COMMITAR', async () => {
    const repo = newRepo();
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await commitPaths(repo, w.touched, 'v1');
    await expect(commitPaths(repo, w.touched, 'v1 de novo')).rejects.toMatchObject({
      code: 'NADA_A_COMMITAR',
    });
  });
  it('remoteInfo e pushBranch: recusas e envio sem force para um bare local', async () => {
    const repo = newRepo();
    expect(await remoteInfo(repo)).toBeNull();
    const bare = newDir('bare');
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(repo, 'remote', 'add', 'origin', bare);
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await commitPaths(repo, w.touched, 'skill(sk): v1');
    const info = (await remoteInfo(repo))!;
    expect(info.url).toBe(bare);
    expect(info.branch).toBe('main');
    expect(info.ahead).toHaveLength(1);
    const permissive = () => null;
    await expect(
      pushBranch(repo, 'https://github.com/outro/repo', permissive),
    ).rejects.toMatchObject({
      code: 'REMOTO_DIFERENTE',
    });
    await expect(pushBranch(repo, bare)).rejects.toMatchObject({ code: 'REMOTO_RECUSADO' });
    expect(git(bare, 'rev-list', '--all', '--count')).toBe('0');
    await pushBranch(repo, bare, permissive);
    expect(git(bare, 'rev-parse', 'main')).toBe(git(repo, 'rev-parse', 'HEAD'));
    await expect(pushBranch(repo, bare, permissive)).rejects.toMatchObject({
      code: 'NADA_A_ENVIAR',
    });
    expect((await remoteInfo(repo))!.ahead).toEqual([]);
  });
  it('remoto apontando para o OpenMAIC é recusado pela política padrão', async () => {
    const repo = newRepo();
    git(repo, 'remote', 'add', 'origin', 'https://github.com/THU-MAIC/OpenMAIC.git');
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await commitPaths(repo, w.touched, 'v1');
    await expect(
      pushBranch(repo, 'https://github.com/THU-MAIC/OpenMAIC.git'),
    ).rejects.toMatchObject({
      code: 'REMOTO_RECUSADO',
    });
    void code;
  });
});

describe('achados da revisão final da fase 3', () => {
  it('config recusa a home, qualquer pasta dentro da gurIA e a raiz em outra caixa', () => {
    const root = newDir('dados');
    const app = newDir('app');
    fs.mkdirSync(path.join(app, 'lib'));
    fs.mkdirSync(path.join(app, 'skills-geradas'));
    const bad = (repoPath: string) =>
      expect(() => saveSkillsConfig(root, { mode: 'separate', repoPath }, app), repoPath).toThrow();
    bad(os.homedir());
    bad(path.join(app, 'lib'));
    bad(path.join(app, 'skills-geradas'));
    if (process.platform === 'win32') bad(app.toUpperCase());
    expect(loadSkillsConfig(root)).toBeNull();
  });
  it('remoteInfo usa a URL de envio (pushurl) e a política recusa o OpenMAIC por ela', async () => {
    const repo = newRepo();
    git(repo, 'remote', 'add', 'origin', 'https://github.com/eu/skills.git');
    git(repo, 'config', 'remote.origin.pushurl', 'https://github.com/THU-MAIC/OpenMAIC.git');
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await commitPaths(repo, w.touched, 'v1');
    const info = (await remoteInfo(repo))!;
    expect(info.url).toBe('https://github.com/THU-MAIC/OpenMAIC.git');
    await expect(pushBranch(repo, info.url)).rejects.toMatchObject({ code: 'REMOTO_RECUSADO' });
    expect(info.head).toMatch(/^[0-9a-f]{40}$/);
  });
  it('redactUrl tira credenciais, inclusive senha com @', () => {
    expect(redactUrl('https://u:ghp_SECRET@github.com/a/b.git')).toBe('https://github.com/a/b.git');
    expect(redactUrl('https://user:p@ss@github.com/a/b')).toBe('https://github.com/a/b');
    expect(redactUrl('git@github.com:a/b.git')).toBe('git@github.com:a/b.git');
  });
  it('política aceita ssh:// e host em outra caixa, e continua recusando o OpenMAIC', () => {
    expect(defaultRemotePolicy('ssh://git@github.com/eu/skills.git')).toBeNull();
    expect(defaultRemotePolicy('https://GitHub.com/eu/skills')).toBeNull();
    expect(defaultRemotePolicy('ssh://git@github.com/THU-MAIC/OpenMAIC.git')).toEqual(
      expect.any(String),
    );
    expect(defaultRemotePolicy('https://GITHUB.com/Thu-Maic/OpenMAIC/')).toEqual(
      expect.any(String),
    );
  });
  it('pushBranch recusa quando o HEAD confirmado não é o atual', async () => {
    const repo = newRepo();
    const bare = newDir('bare');
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(repo, 'remote', 'add', 'origin', bare);
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await commitPaths(repo, w.touched, 'v1');
    const info = (await remoteInfo(repo))!;
    await expect(pushBranch(repo, bare, () => null, 'f'.repeat(40))).rejects.toMatchObject({
      code: 'ESTADO_MUDOU',
    });
    await pushBranch(repo, bare, () => null, info.head);
    expect(git(bare, 'rev-parse', 'main')).toBe(info.head);
  });
  it('commit que falha (hook) deixa o índice limpo', async () => {
    const repo = newRepo();
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    try {
      fs.chmodSync(hook, 0o755);
    } catch {}
    const w = await writeSkill({ dir: repo, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' });
    await expect(commitPaths(repo, w.touched, 'v1')).rejects.toMatchObject({
      code: 'GIT_COMMIT_FALHOU',
    });
    await w.rollback();
    expect(git(repo, 'status', '--porcelain')).toBe('');
  });
  it('repoTopLevel devolve a raiz do repositório', async () => {
    const repo = newRepo();
    const inner = path.join(repo, 'sub');
    fs.mkdirSync(inner);
    expect(samePath((await repoTopLevel(inner))!, repo)).toBe(true);
    expect(await repoTopLevel(newDir('fora'))).toBeNull();
  });
  it('junction dentro do destino não deixa a gravação sair da pasta', async () => {
    const dir = newDir('destino');
    const outside = newDir('fora');
    fs.symlinkSync(outside, path.join(dir, 'sk'), 'junction');
    await expect(
      writeSkill({ dir, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' }),
    ).rejects.toBeDefined();
    expect(fs.readdirSync(outside)).toEqual([]);
    const dir2 = newDir('destino');
    fs.mkdirSync(path.join(dir2, 'sk'));
    fs.symlinkSync(outside, path.join(dir2, 'sk', 'references'), 'junction');
    await expect(
      writeSkill({ dir: dir2, slug: 'sk', files: skillFiles('sk'), rootReadme: 'R' }),
    ).rejects.toBeDefined();
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it('writeSkill sem rootReadme não mexe no README da raiz', async () => {
    const dir = newDir('destino');
    fs.writeFileSync(path.join(dir, 'README.md'), 'DO DONO');
    const w = await writeSkill({ dir, slug: 'sk', files: skillFiles('sk') });
    expect(read(dir, 'README.md')).toBe('DO DONO');
    expect(w.touched).not.toContain('README.md');
  });
});
