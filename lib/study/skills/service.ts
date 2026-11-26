import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from '../domain';
import type { Generate } from '../exercises/grade-ai';
import { AppError } from '../runtime/analysis';
import {
  loadSkillsConfig,
  samePath,
  saveSkillsConfig,
  validateDestination,
  type SkillsConfig,
} from './config';
import {
  ROOT_README_MARKER,
  buildRootReadme,
  parseSkillMd,
  snapshotConcepts,
  templateIntro,
  templateSkillMd,
  validateSkillMd,
  type Manifest,
} from './content';
import { draftWithAi } from './draft';
import { eligibleConcepts } from './eligible';
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
} from './git';
import {
  MANIFEST_PATH,
  improveWithAi,
  improveWithoutAi,
  introFromReadme,
  proposeVersion,
} from './improve';
import { validateSkillName } from './names';
import { isSkillPath, listSkills, readSkillFiles, writeSkill } from './repo';

export type Deps = {
  root: string;
  appRoot: string;
  workspace: Workspace;
  generate?: Generate;
  now?: () => Date;
};
type Common = { slug: string; name: string; conceptIds: string[]; includeAnswers: boolean };

const fail = (status: number, code: string, message: string) => new AppError(status, code, message);

// Um salvamento por pasta de destino por vez (duas abas não gravam a mesma skill ao mesmo tempo).
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, job: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(job);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

function destination(deps: Deps): SkillsConfig {
  const config = loadSkillsConfig(deps.root);
  if (!config) throw fail(409, 'SEM_DESTINO', 'Escolha primeiro onde as skills serão guardadas.');
  return config;
}

function currentState(dir: string, slug: string) {
  const files = readSkillFiles(dir, slug) ?? {};
  if (!Object.keys(files).length) return { files, manifest: undefined as Manifest | undefined };
  let manifest: Manifest | undefined;
  try {
    const parsed = JSON.parse(files[MANIFEST_PATH] ?? '');
    if (
      parsed?.schema === 'gurIA-skill-v1' &&
      parsed.slug === slug &&
      Number.isInteger(parsed.version) &&
      parsed.version >= 1 &&
      Array.isArray(parsed.concepts)
    )
      manifest = parsed as Manifest;
  } catch {}
  if (!manifest)
    throw fail(
      409,
      'MANIFESTO_INVALIDO',
      'A pasta desta skill existe, mas o manifesto (.guria/manifest.json) está ausente ou inválido. Corrija ou remova a pasta antes de continuar.',
    );
  return { files, manifest };
}

export async function getSkillsState(deps: Deps) {
  const config = loadSkillsConfig(deps.root);
  const gitOk = await gitAvailable();
  const repoOk = !!config && gitOk && (await isRepo(config.repoPath).catch(() => false));
  const identityOk = repoOk && !!config && (await hasIdentity(config.repoPath));
  const courses = new Map(deps.workspace.courses.map((c) => [c.id, c.title]));
  return {
    config,
    gitOk,
    repoOk,
    identityOk,
    skills: config ? listSkills(config.repoPath) : [],
    eligible: eligibleConcepts(deps.workspace).map((c) => ({
      id: c.id,
      label: c.label,
      courseTitle: courses.get(c.courseIds[0] ?? ''),
    })),
  };
}

/** Valida e grava o destino. Recusa pasta que está dentro de outro repositório. */
export async function configureSkills(
  deps: Deps,
  input: { mode: 'separate' | 'in-repo'; repoPath?: string; initRepo?: boolean },
) {
  const config = validateDestination(input, deps.appRoot);
  if (config.mode === 'separate') {
    let top: string | null = null;
    try {
      top = (await isRepo(config.repoPath)) ? await repoTopLevel(config.repoPath) : null;
    } catch {}
    if (top && !samePath(top, config.repoPath))
      throw fail(
        409,
        'DESTINO_DENTRO_DE_REPOSITORIO',
        'Esta pasta está dentro de outro repositório git e os commits iriam para ele. Escolha a pasta raiz do repositório de skills.',
      );
  }
  saveSkillsConfig(deps.root, input, deps.appRoot);
  // Só a pasta que acabou de ser salva é iniciada; nunca outra.
  if (input.initRepo && config.mode === 'separate' && !(await isRepo(config.repoPath)))
    await initRepo(config.repoPath);
  return getSkillsState(deps);
}

export async function previewSkill(
  deps: Deps,
  args: Common & { mode: 'template' | 'ai'; harness?: 'codex' | 'claude'; model?: string },
) {
  const config = destination(deps);
  const nameError = validateSkillName(args.slug);
  if (nameError) throw fail(400, 'NOME_INVALIDO', nameError);
  if (!args.conceptIds.length)
    throw fail(400, 'SEM_CONCEITOS', 'Escolha pelo menos um conceito dominado.');
  const snaps = snapshotConcepts(deps.workspace, args.conceptIds, {
    includeAnswers: args.includeAnswers,
  });
  const { files, manifest } = currentState(config.repoPath, args.slug);
  let skillMd: string;
  let intro: string;
  if (args.mode === 'ai') {
    if (!deps.generate || !args.harness)
      throw fail(400, 'SEM_IA', 'Escolha a IA para redigir o texto.');
    const result = manifest
      ? await improveWithAi({
          slug: args.slug,
          name: args.name,
          snaps,
          manifest,
          previousFiles: files,
          generate: deps.generate,
          harness: args.harness,
          model: args.model,
        })
      : await draftWithAi({
          slug: args.slug,
          name: args.name,
          snaps,
          generate: deps.generate,
          harness: args.harness,
          model: args.model,
        });
    ({ skillMd, intro } = result);
  } else if (files['SKILL.md']) {
    skillMd = improveWithoutAi({ previousSkillMd: files['SKILL.md'], snaps });
    intro = introFromReadme(files['README.md']) || templateIntro(snaps.length);
  } else {
    skillMd = templateSkillMd({ slug: args.slug, name: args.name, snaps });
    intro = templateIntro(snaps.length);
  }
  const proposal = proposeVersion({
    slug: args.slug,
    name: args.name,
    manifest,
    previousFiles: files,
    snaps,
    includeAnswers: args.includeAnswers,
    skillMd,
    intro,
    now: (deps.now?.() ?? new Date()).toISOString(),
  });
  return {
    ...proposal,
    skillMd: proposal.next['SKILL.md'],
    intro,
    baseVersion: manifest?.version ?? 0,
  };
}

export async function saveSkill(
  deps: Deps,
  args: Common & {
    skillMd: string;
    intro: string;
    acknowledgeWarnings: boolean;
    baseVersion: number;
  },
) {
  const config = destination(deps);
  return withLock(config.repoPath, () => saveSkillLocked(deps, config, args));
}

async function saveSkillLocked(
  deps: Deps,
  config: SkillsConfig,
  args: Common & {
    skillMd: string;
    intro: string;
    acknowledgeWarnings: boolean;
    baseVersion: number;
  },
) {
  const dir = config.repoPath;
  const nameError = validateSkillName(args.slug);
  if (nameError) throw fail(400, 'NOME_INVALIDO', nameError);
  if (!args.conceptIds.length)
    throw fail(400, 'SEM_CONCEITOS', 'Escolha pelo menos um conceito dominado.');
  const snaps = snapshotConcepts(deps.workspace, args.conceptIds, {
    includeAnswers: args.includeAnswers,
  });
  const { files, manifest } = currentState(dir, args.slug);
  if ((manifest?.version ?? 0) !== args.baseVersion)
    throw fail(
      409,
      'VERSAO_DESATUALIZADA',
      'Esta skill mudou desde que você abriu a revisão. Gere a proposta de novo.',
    );
  const mdErrors = validateSkillMd(args.skillMd, args.slug);
  if (mdErrors.length) throw fail(400, 'SKILL_INVALIDA', mdErrors.join(' '));
  const proposal = proposeVersion({
    slug: args.slug,
    name: args.name,
    manifest,
    previousFiles: files,
    snaps,
    includeAnswers: args.includeAnswers,
    skillMd: args.skillMd,
    intro: args.intro,
    now: (deps.now?.() ?? new Date()).toISOString(),
  });
  const blocking = proposal.warnings.filter((f) => f.severity === 'bloqueia');
  if (blocking.length)
    throw fail(
      422,
      'DADOS_SENSIVEIS',
      'Há chaves ou tokens no texto. Remova antes de salvar: ' +
        blocking.map((f) => `${f.file}:${f.line}`).join(', '),
    );
  const warnings = proposal.warnings.filter((f) => f.severity === 'avisa');
  if (warnings.length && !args.acknowledgeWarnings)
    throw fail(
      422,
      'DADOS_SENSIVEIS',
      'Há dados que podem ser pessoais ou perigosos no texto (' +
        [...new Set(warnings.map((f) => f.kind))].join(', ') +
        '). Revise e confirme que quer salvar mesmo assim.',
    );
  if (proposal.empty && args.skillMd === files['SKILL.md'])
    throw fail(409, 'NADA_A_MELHORAR', `Nada mudou desde a versão v${manifest?.version}.`);
  if (!(await gitAvailable()))
    throw fail(428, 'SEM_GIT', 'O git não está instalado. Instale em git-scm.com e tente de novo.');
  if (!(await isRepo(dir)))
    throw fail(
      409,
      'SEM_REPOSITORIO',
      'A pasta de destino ainda não é um repositório git. Inicie-o na tela de destino.',
    );
  if (!(await hasIdentity(dir)))
    throw fail(
      428,
      'GIT_SEM_IDENTIDADE',
      'Configure sua identidade no git antes de registrar: git config --global user.name "Seu Nome" e git config --global user.email "voce@exemplo.com".',
    );

  // Só remove referências que o manifesto lista, que são caminhos de skill válidos e que existem de fato.
  const staleRel = (manifest?.concepts ?? [])
    .map((c) => c.file)
    .filter((f) => isSkillPath(f) && f in files && !(f in proposal.next));
  const others = listSkills(dir).filter((s) => s.slug !== args.slug);
  const parsed = parseSkillMd(proposal.next['SKILL.md']);
  // O README da raiz só é reescrito se for o índice gerado pela gurIA (ou se ainda não existir).
  let existingRoot: string | null = null;
  try {
    existingRoot = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  } catch {}
  const ownsRoot = existingRoot === null || existingRoot.includes(ROOT_README_MARKER);
  const rootReadme = ownsRoot
    ? buildRootReadme(
        [
          ...others,
          {
            slug: args.slug,
            name: args.name,
            version: proposal.version,
            description: parsed?.description ?? '',
            count: snaps.length,
          },
        ],
        path.basename(dir),
      )
    : undefined;
  const written = await writeSkill({
    dir,
    slug: args.slug,
    files: proposal.next,
    removeStale: staleRel,
    rootReadme,
  });
  const c = proposal.changes;
  const message = `skill(${args.slug}): v${proposal.version} — +${c.added.length} −${c.removed.length} ~${c.changed.length} conceitos`;
  try {
    const paths = [...written.touched, ...staleRel.map((f) => `${args.slug}/${f}`)];
    const { hash } = await commitPaths(dir, paths, message);
    return {
      version: proposal.version,
      commit: hash,
      paths,
      rootReadme: ownsRoot ? ('atualizado' as const) : ('preservado' as const),
    };
  } catch (error) {
    await written.rollback();
    throw error;
  }
}

export async function pushState(deps: Deps) {
  const config = destination(deps);
  if (config.mode === 'in-repo')
    return {
      available: false as const,
      reason:
        'O destino skills-geradas/ fica dentro da gurIA: publique o repositório da gurIA por conta própria.',
    };
  const info = await remoteInfo(config.repoPath);
  if (!info)
    return {
      available: false as const,
      reason: 'Nenhum remoto configurado neste repositório (git remote add origin <url>).',
    };
  return {
    available: true as const,
    // Sem credenciais embutidas: o navegador nunca recebe token de URL.
    url: redactUrl(info.url),
    branch: info.branch,
    head: info.head,
    ahead: info.ahead,
    refused: defaultRemotePolicy(info.url) ?? defaultRemotePolicy(info.fetchUrl),
  };
}

export async function pushSkills(
  deps: Deps,
  args: { confirmedRemote: string; confirmedHead?: string },
) {
  const config = destination(deps);
  if (config.mode === 'in-repo')
    throw fail(
      409,
      'SEM_PUSH_IN_REPO',
      'Não há envio automático para skills-geradas/: publique o repositório da gurIA por conta própria.',
    );
  await pushBranch(config.repoPath, args.confirmedRemote, defaultRemotePolicy, args.confirmedHead);
  return { ok: true };
}
