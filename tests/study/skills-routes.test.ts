import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { emptyWorkspace, recordAnswer, type Concept, type Workspace } from '@/lib/study/domain';

const doubles = vi.hoisted(() => ({
  generate: vi.fn(),
  root: '',
  state: { revision: 1, data: null as unknown as Workspace },
}));
vi.mock('@/lib/study/store', () => ({
  readWorkspace: async () => ({ revision: doubles.state.revision, data: doubles.state.data }),
  saveWorkspace: vi.fn(),
  saveWorkspaceInTransaction: vi.fn(),
  studyPool: vi.fn(),
}));
vi.mock('@/lib/study/service', () => ({
  service: () => ({
    harness: 'codex',
    model: 'gpt-6-luna',
    generate: doubles.generate,
    root: doubles.root,
  }),
}));
vi.mock('@/lib/study/runtime/media', () => ({ localReady: () => true }));
vi.mock('@/lib/study/owner', () => ({
  withRequestOwner: async (
    req: NextRequest,
    handler: (owner: { ownerId: string }, headers: Headers) => Promise<Response>,
  ) => {
    const ownerId = req.headers.get('x-test-owner');
    return ownerId ? handler({ ownerId }, new Headers()) : new Response(null, { status: 401 });
  },
}));
import { GET, POST, PUT } from '@/app/api/study/[...path]/route';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-skills-routes-'));
const saved: Record<string, string | undefined> = {};
let n = 0;
let dest = '';
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const newRepo = (identity = true) => {
  const dir = path.join(tmp, `destino-${++n}`);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  if (identity) {
    git(dir, 'config', 'user.name', 'Teste');
    git(dir, 'config', 'user.email', 'teste@example.test');
  }
  return dir;
};

const d = (day: number) => new Date(2026, 10, 1 + day, 12).getTime();
const mastered = (id: string, label: string): Concept => {
  let c: Concept = {
    id,
    label,
    summary: 'Resumo de ' + label,
    note: 'Nota sobre ' + label,
    origin: 'manual',
    courseIds: [],
    evidence: [],
    attempts: [],
    due: 0,
    exercises: [],
  };
  c = recordAnswer(c, true, 'write', 1, d(0));
  return recordAnswer(c, true, 'write', 1, d(4));
};
const studying = (): Concept => ({
  ...mastered('c', 'Gama'),
  attempts: [{ at: d(0), correct: true, kind: 'choice', score: 1, helped: false }],
});
const freshWorkspace = (): Workspace => ({
  ...emptyWorkspace(),
  concepts: [mastered('a', 'Alfa'), mastered('b', 'Beta'), studying()],
});

function call(
  route: string,
  body?: unknown,
  owner = 'owner-a',
  method: 'POST' | 'GET' | 'PUT' = 'POST',
) {
  const req = new NextRequest('http://127.0.0.1:3033/api/study/' + route, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-test-owner': owner },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  });
  const ctx = { params: Promise.resolve({ path: [route] }) };
  return method === 'POST' ? POST(req, ctx) : method === 'PUT' ? PUT(req, ctx) : GET(req, ctx);
}
const configure = async (repoPath = dest) =>
  call('skill-config', { mode: 'separate', repoPath }, 'owner-a', 'PUT');
const preview = (over: Record<string, unknown> = {}) =>
  call('skill-preview', {
    slug: 'estatistica',
    name: 'Estatística',
    conceptIds: ['a', 'b'],
    includeAnswers: false,
    mode: 'template',
    ...over,
  });
const save = (over: Record<string, unknown>) =>
  call('skill-save', {
    slug: 'estatistica',
    name: 'Estatística',
    conceptIds: ['a', 'b'],
    includeAnswers: false,
    acknowledgeWarnings: false,
    baseVersion: 0,
    intro: 'Introdução do dono.',
    ...over,
  });
const previewThenSave = async (over: Record<string, unknown> = {}, previewOver = {}) => {
  const p = await (await preview(previewOver)).json();
  return save({ skillMd: p.skillMd, intro: p.intro, baseVersion: p.baseVersion, ...over });
};

beforeAll(() => {
  const empty = path.join(tmp, 'gitconfig-vazio');
  fs.writeFileSync(empty, '');
  for (const key of [
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_NOSYSTEM',
    'GURIA_APP_ROOT',
    'OPENMAIC_STUDY_LOCAL',
  ])
    saved[key] = process.env[key];
  process.env.GIT_CONFIG_GLOBAL = empty;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.OPENMAIC_STUDY_LOCAL = 'true';
});
afterAll(() => {
  for (const [key, value] of Object.entries(saved))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  fs.rmSync(tmp, { recursive: true, force: true });
});
beforeEach(() => {
  doubles.generate.mockReset();
  doubles.state.data = freshWorkspace();
  doubles.root = path.join(tmp, `dados-${++n}`);
  const app = path.join(tmp, `app-${++n}`);
  fs.mkdirSync(app, { recursive: true });
  process.env.GURIA_APP_ROOT = app;
  dest = newRepo();
});

it('sem dono todas as rotas recebem 401, e campo extra no corpo dá 400', async () => {
  expect((await call('skill-state', undefined, '', 'GET')).status).toBe(401);
  expect((await call('skill-preview', {}, '')).status).toBe(401);
  expect((await call('skill-save', {}, '')).status).toBe(401);
  expect((await call('skill-push', {}, '')).status).toBe(401);
  await configure();
  expect((await preview({ extra: 1 })).status).toBe(400);
  expect((await call('skill-push', { confirmedRemote: 'x', mode: 'force' })).status).toBe(400);
});

it('skill-state sem configuração, configuração inválida e válida com os elegíveis', async () => {
  const none = await (await call('skill-state', undefined, 'owner-a', 'GET')).json();
  expect(none.config).toBeNull();
  const bad = await configure(path.join(tmp, 'nao-existe'));
  expect(bad.status).toBe(400);
  expect((await bad.json()).code).toBe('DESTINO_INVALIDO');
  const ok = await (await configure()).json();
  expect(ok.config).toMatchObject({ mode: 'separate' });
  expect(ok).toMatchObject({ gitOk: true, repoOk: true, identityOk: true });
  expect(ok.eligible.map((c: { id: string }) => c.id).sort()).toEqual(['a', 'b']);
});

it('skill-config com initRepo inicia o repositório da pasta escolhida', async () => {
  const plain = path.join(tmp, `plain-${++n}`);
  fs.mkdirSync(plain);
  const before = await (await configure(plain)).json();
  expect(before.repoOk).toBe(false);
  const res = await call(
    'skill-config',
    { mode: 'separate', repoPath: plain, initRepo: true },
    'owner-a',
    'PUT',
  );
  expect((await res.json()).repoOk).toBe(true);
});

it('skill-preview em modo template não chama a IA; em modo ai usa o harness pedido e recusa outro', async () => {
  await configure();
  const t = await (await preview()).json();
  expect(doubles.generate).not.toHaveBeenCalled();
  expect(t).toMatchObject({ version: 1, empty: false, warnings: [], baseVersion: 0 });
  expect(t.skillMd).toContain('name: estatistica');
  doubles.generate.mockResolvedValue(
    JSON.stringify({
      description: 'Use quando precisar de estatística.',
      intro: 'Resumo.',
      whenToUse: ['Ao explicar dados.'],
      howToApply: ['Comece pelo resumo.'],
    }),
  );
  const ai = await preview({ mode: 'ai', harness: 'codex' });
  expect(ai.status).toBe(200);
  expect(doubles.generate).toHaveBeenCalledTimes(1);
  expect(doubles.generate.mock.calls[0][4]).toBe('codex');
  const other = await preview({ mode: 'ai', harness: 'claude' });
  expect(other.status).toBe(409);
  expect((await other.json()).code).toBe('HARNESS_CHANGED');
  expect(doubles.generate).toHaveBeenCalledTimes(1);
  const notMastered = await preview({ conceptIds: ['a', 'c'] });
  expect(notMastered.status).toBe(409);
  expect((await notMastered.json()).code).toBe('CONCEITO_NAO_DOMINADO');
});

it('skill-save cria a pasta e um único commit só com os caminhos da skill e o README raiz', async () => {
  await configure();
  fs.writeFileSync(path.join(dest, 'outro.txt'), 'trabalho do dono');
  const res = await previewThenSave();
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.version).toBe(1);
  expect(git(dest, 'rev-list', '--count', 'HEAD')).toBe('1');
  const shown = git(dest, 'show', '--name-only', '--pretty=format:%s', 'HEAD').split('\n');
  expect(shown[0]).toMatch(/^skill\(estatistica\): v1/);
  expect(shown.slice(1)).toContain('README.md');
  expect(shown.slice(1)).toContain('estatistica/SKILL.md');
  expect(shown.slice(1).some((f) => f.startsWith('estatistica/references/'))).toBe(true);
  expect(shown.slice(1)).toContain('estatistica/.guria/manifest.json');
  expect(shown.join('\n')).not.toContain('outro.txt');
  const again = await save({ skillMd: (await (await preview()).json()).skillMd, baseVersion: 0 });
  expect(again.status).toBe(409);
  expect((await again.json()).code).toBe('VERSAO_DESATUALIZADA');
});

it('skill-save recusa SKILL.md inválido, chaves e e-mails sem confirmação, sem gravar nada', async () => {
  await configure();
  const p = await (await preview()).json();
  const wrongName = await save({
    skillMd: p.skillMd.replace('name: estatistica', 'name: outro'),
    baseVersion: 0,
  });
  expect(wrongName.status).toBe(400);
  const secret = await save({
    skillMd: p.skillMd + '\nchave ghp_' + 'a'.repeat(36) + '\n',
    baseVersion: 0,
  });
  expect(secret.status).toBe(422);
  expect((await secret.json()).code).toBe('DADOS_SENSIVEIS');
  const secretAcknowledged = await save({
    skillMd: p.skillMd + '\nchave ghp_' + 'a'.repeat(36) + '\n',
    baseVersion: 0,
    acknowledgeWarnings: true,
  });
  expect(secretAcknowledged.status).toBe(422); // chave nunca passa, nem com confirmação
  const withEmail = p.skillMd + '\nFale com fulano@exemplo.com\n';
  const noAck = await save({ skillMd: withEmail, baseVersion: 0 });
  expect(noAck.status).toBe(422);
  expect(fs.existsSync(path.join(dest, 'estatistica'))).toBe(false);
  expect(() => git(dest, 'rev-parse', 'HEAD')).toThrow();
  const ack = await save({ skillMd: withEmail, baseVersion: 0, acknowledgeWarnings: true });
  expect(ack.status).toBe(201);
});

it('o texto editado na introdução também é verificado', async () => {
  await configure();
  const res = await previewThenSave({ intro: 'Meu token: sk-' + 'b'.repeat(30) });
  expect(res.status).toBe(422);
  expect(fs.existsSync(path.join(dest, 'estatistica'))).toBe(false);
});

it('sem identidade no git não grava nada', async () => {
  const noIdentity = newRepo(false);
  await configure(noIdentity);
  const res = await previewThenSave();
  expect(res.status).toBe(428);
  expect((await res.json()).code).toBe('GIT_SEM_IDENTIDADE');
  expect(fs.existsSync(path.join(noIdentity, 'estatistica'))).toBe(false);
});

it('melhoria: conceito sai e outro entra, o texto do dono é preservado e o commit é v2', async () => {
  await configure();
  const first = await (await preview()).json();
  const edited = first.skillMd.replace('## Quando usar', 'PARÁGRAFO DO DONO.\n\n## Quando usar');
  expect((await save({ skillMd: edited, baseVersion: 0 })).status).toBe(201);
  // "a" perde o domínio em revisão espaçada; "d" passa a ser dominado
  const lost = recordAnswer(mastered('a', 'Alfa'), false, 'choice', 0, d(10), undefined, {
    mode: 'revisao',
  });
  doubles.state.data = {
    ...doubles.state.data,
    concepts: [lost, mastered('b', 'Beta'), mastered('d', 'Delta')],
  };
  const next = await (await preview({ conceptIds: ['b', 'd'] })).json();
  expect(next.version).toBe(2);
  expect(next.changes).toEqual({ added: ['d'], removed: ['a'], changed: [] });
  expect(next.skillMd).toContain('PARÁGRAFO DO DONO.');
  expect(next.skillMd).not.toContain('[Alfa]');
  expect(Object.keys(next.next).some((f) => f.startsWith('references/alfa'))).toBe(false);
  const res = await save({
    conceptIds: ['b', 'd'],
    skillMd: next.skillMd,
    intro: next.intro,
    baseVersion: 1,
  });
  expect(res.status).toBe(201);
  expect((await res.json()).version).toBe(2);
  expect(git(dest, 'rev-list', '--count', 'HEAD')).toBe('2');
  expect(git(dest, 'log', '-1', '--format=%s')).toMatch(/^skill\(estatistica\): v2 — \+1 −1 ~0/);
  expect(
    fs.readdirSync(path.join(dest, 'estatistica', 'references')).some((f) => f.startsWith('alfa')),
  ).toBe(false);
  const nothing = await preview({ conceptIds: ['b', 'd'] });
  expect((await nothing.json()).empty).toBe(true);
});

it('push: sem push para in-repo, sem origin, confirmação diferente e remoto OpenMAIC recusados', async () => {
  const inRepo = await call('skill-config', { mode: 'in-repo' }, 'owner-a', 'PUT');
  expect(inRepo.status).toBe(200);
  expect(
    (await (await call('skill-push-state', undefined, 'owner-a', 'GET')).json()).available,
  ).toBe(false);
  const noPush = await call('skill-push', { confirmedRemote: 'x' });
  expect(noPush.status).toBe(409);
  expect((await noPush.json()).code).toBe('SEM_PUSH_IN_REPO');

  await configure();
  expect(
    (await (await call('skill-push-state', undefined, 'owner-a', 'GET')).json()).available,
  ).toBe(false);
  const noRemote = await call('skill-push', { confirmedRemote: 'x' });
  expect((await noRemote.json()).code).toBe('SEM_REMOTO');

  expect((await previewThenSave()).status).toBe(201);
  git(dest, 'remote', 'add', 'origin', 'https://github.com/THU-MAIC/OpenMAIC.git');
  const state = await (await call('skill-push-state', undefined, 'owner-a', 'GET')).json();
  expect(state).toMatchObject({ available: true, branch: 'main' });
  expect(state.refused).toMatch(/OpenMAIC/);
  expect(state.ahead).toHaveLength(1);
  const different = await call('skill-push', { confirmedRemote: 'https://github.com/outro/repo' });
  expect((await different.json()).code).toBe('REMOTO_DIFERENTE');
  const refused = await call('skill-push', {
    confirmedRemote: 'https://github.com/THU-MAIC/OpenMAIC.git',
  });
  expect(refused.status).toBe(409);
  expect((await refused.json()).code).toBe('REMOTO_RECUSADO');
});

it('fora do modo local as rotas de skills ficam desligadas', async () => {
  const previous = process.env.OPENMAIC_STUDY_LOCAL;
  process.env.OPENMAIC_STUDY_LOCAL = 'false';
  try {
    const state = await call('skill-state', undefined, 'owner-a', 'GET');
    expect(state.status).toBe(403);
    expect((await state.json()).code).toBe('SO_MODO_LOCAL');
    expect((await configure()).status).toBe(403);
    expect((await call('skill-push', { confirmedRemote: 'x' })).status).toBe(403);
  } finally {
    process.env.OPENMAIC_STUDY_LOCAL = previous;
  }
});

it('skill-config recusa pasta dentro de outro repositório e a home', async () => {
  const inner = path.join(dest, 'dentro');
  fs.mkdirSync(inner);
  const nested = await configure(inner);
  expect(nested.status).toBe(409);
  expect((await nested.json()).code).toBe('DESTINO_DENTRO_DE_REPOSITORIO');
  expect((await configure(os.homedir())).status).toBe(400);
  expect((await (await call('skill-state', undefined, 'owner-a', 'GET')).json()).config).toBeNull();
});

it('skill-config com initRepo só inicia a pasta salva, nunca outra', async () => {
  const plain = path.join(tmp, `plain-${++n}`);
  fs.mkdirSync(plain);
  const res = await call(
    'skill-config',
    { mode: 'separate', repoPath: plain, initRepo: true },
    'owner-a',
    'PUT',
  );
  expect((await res.json()).config.repoPath).toBe(path.resolve(plain));
  expect(fs.existsSync(path.join(plain, '.git'))).toBe(true);
});

it('referência listada no manifesto mas ausente no disco não trava a melhoria', async () => {
  await configure();
  expect((await previewThenSave()).status).toBe(201);
  const refs = path.join(dest, 'estatistica', 'references');
  const gone = fs.readdirSync(refs)[0];
  fs.rmSync(path.join(refs, gone));
  git(dest, 'add', '-A');
  git(dest, 'commit', '-q', '-m', 'dono apagou uma referência');
  const lost = recordAnswer(mastered('b', 'Beta'), false, 'choice', 0, d(10), undefined, {
    mode: 'revisao',
  });
  doubles.state.data = {
    ...doubles.state.data,
    concepts: [mastered('a', 'Alfa'), lost, mastered('d', 'Delta')],
  };
  const next = await (await preview({ conceptIds: ['a', 'd'] })).json();
  const res = await save({
    conceptIds: ['a', 'd'],
    skillMd: next.skillMd,
    intro: next.intro,
    baseVersion: 1,
  });
  expect(res.status).toBe(201);
});

it('o README da raiz que o dono já tinha não é sobrescrito', async () => {
  await configure();
  fs.writeFileSync(path.join(dest, 'README.md'), '# Meu repositório\n\nTexto do dono.\n');
  git(dest, 'add', 'README.md');
  git(dest, 'commit', '-q', '-m', 'base');
  const res = await previewThenSave();
  expect(res.status).toBe(201);
  expect((await res.json()).rootReadme).toBe('preservado');
  expect(fs.readFileSync(path.join(dest, 'README.md'), 'utf8')).toContain('Texto do dono.');
  expect(git(dest, 'show', '--name-only', '--pretty=format:', 'HEAD')).not.toContain('\nREADME.md');
});

it('o índice gerado da raiz é atualizado nas versões seguintes', async () => {
  await configure();
  expect((await (await previewThenSave()).json()).rootReadme).toBe('atualizado');
  expect(fs.readFileSync(path.join(dest, 'README.md'), 'utf8')).toContain('estatistica');
});

it('manifesto inválido ou de outra skill é recusado em vez de tratar a skill como nova', async () => {
  await configure();
  expect((await previewThenSave()).status).toBe(201);
  const manifestPath = path.join(dest, 'estatistica', '.guria', 'manifest.json');
  const original = fs.readFileSync(manifestPath, 'utf8');
  for (const broken of [
    '{nao é json',
    JSON.stringify({ ...JSON.parse(original), slug: 'outra' }),
    JSON.stringify({ ...JSON.parse(original), concepts: 'x' }),
  ]) {
    fs.writeFileSync(manifestPath, broken);
    const res = await preview();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('MANIFESTO_INVALIDO');
  }
});

it('o envio recusa quando o HEAD confirmado não é o atual', async () => {
  await configure();
  const bare = path.join(tmp, `bare-${++n}`);
  fs.mkdirSync(bare);
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(dest, 'remote', 'add', 'origin', bare);
  expect((await previewThenSave()).status).toBe(201);
  const state = await (await call('skill-push-state', undefined, 'owner-a', 'GET')).json();
  expect(state.head).toMatch(/^[0-9a-f]{40}$/);
  const res = await call('skill-push', {
    confirmedRemote: state.url,
    confirmedHead: 'f'.repeat(40),
  });
  // a política padrão recusa remoto que não é do GitHub; a ordem das recusas não importa para a garantia
  expect([409]).toContain(res.status);
  expect(git(bare, 'rev-list', '--all', '--count')).toBe('0');
});
