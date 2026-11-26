import { execFile } from 'node:child_process';
import { AppError } from '../runtime/analysis';

export type RemotePolicy = (url: string) => string | null;

type Result = { code: number; stdout: string; stderr: string };

function run(dir: string, args: string[]): Promise<Result> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd: dir, timeout: 60000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT')
          return reject(
            new AppError(
              428,
              'SEM_GIT',
              'O git não está instalado. Instale em git-scm.com e tente de novo.',
            ),
          );
        const code = error ? Number((error as { code?: unknown }).code) || 1 : 0;
        resolve({ code, stdout: String(stdout).trim(), stderr: String(stderr).trim() });
      },
    );
  });
}

/** Nunca devolve credenciais embutidas em URLs (inclusive senha com "@"). */
export const redactUrl = (url: string): string =>
  url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/]*@/i, '$1');
const sanitize = (text: string) => text.replace(/:\/\/[^\s/]*@/g, '://');
const fail = (r: Result, code: string, message: string) =>
  new AppError(500, code, `${message} ${sanitize(r.stderr).slice(-300)}`.trim());

export async function gitAvailable(): Promise<boolean> {
  try {
    return (await run(process.cwd(), ['--version'])).code === 0;
  } catch {
    return false;
  }
}

export async function isRepo(dir: string): Promise<boolean> {
  const r = await run(dir, ['rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout === 'true';
}

/** Raiz do repositório que contém a pasta (ou null se não for um repositório). */
export async function repoTopLevel(dir: string): Promise<string | null> {
  const r = await run(dir, ['rev-parse', '--show-toplevel']);
  return r.code === 0 && r.stdout ? r.stdout : null;
}

export async function initRepo(dir: string): Promise<void> {
  const r = await run(dir, ['init', '-q']);
  if (r.code !== 0) throw fail(r, 'GIT_INIT_FALHOU', 'Não foi possível iniciar o repositório.');
}

export async function hasIdentity(dir: string): Promise<boolean> {
  const name = await run(dir, ['config', 'user.name']);
  const email = await run(dir, ['config', 'user.email']);
  return !!name.stdout && !!email.stdout;
}

export async function commitPaths(
  dir: string,
  paths: string[],
  message: string,
): Promise<{ hash: string }> {
  if (!paths.length) throw new AppError(409, 'NADA_A_COMMITAR', 'Não há arquivos para registrar.');
  if (!(await hasIdentity(dir)))
    throw new AppError(
      428,
      'GIT_SEM_IDENTIDADE',
      'Configure sua identidade no git antes de registrar: git config --global user.name "Seu Nome" e git config --global user.email "voce@exemplo.com".',
    );
  const add = await run(dir, ['add', '--', ...paths]);
  if (add.code !== 0) {
    await run(dir, ['reset', '-q', '--', ...paths]);
    throw fail(add, 'GIT_ADD_FALHOU', 'Não foi possível preparar os arquivos.');
  }
  const changed = await run(dir, ['diff', '--cached', '--quiet', '--', ...paths]);
  if (changed.code === 0)
    throw new AppError(409, 'NADA_A_COMMITAR', 'Nada mudou em relação à versão já registrada.');
  const commit = await run(dir, ['commit', '-q', '-m', message, '--', ...paths]);
  if (commit.code !== 0) {
    // Não deixa o conteúdo descartado no índice do dono: o próximo commit dele o levaria junto.
    await run(dir, ['reset', '-q', '--', ...paths]);
    throw fail(commit, 'GIT_COMMIT_FALHOU', 'Não foi possível criar o commit.');
  }
  const head = await run(dir, ['rev-parse', 'HEAD']);
  return { hash: head.stdout };
}

export async function remoteInfo(dir: string): Promise<{
  url: string;
  fetchUrl: string;
  branch: string;
  head: string;
  ahead: string[];
} | null> {
  const fetchUrl = await run(dir, ['remote', 'get-url', 'origin']);
  if (fetchUrl.code !== 0 || !fetchUrl.stdout) return null;
  // O envio usa a URL de push (pushurl/insteadOf): é ela que a política e a confirmação precisam ver.
  const pushUrl = await run(dir, ['remote', 'get-url', '--push', 'origin']);
  const url = pushUrl.code === 0 && pushUrl.stdout ? pushUrl.stdout : fetchUrl.stdout;
  const branch = (await run(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;
  const head = (await run(dir, ['rev-parse', 'HEAD'])).stdout;
  const tracked = await run(dir, ['rev-parse', '--verify', '-q', `origin/${branch}`]);
  const log = await run(dir, [
    'log',
    '--oneline',
    ...(tracked.code === 0 ? [`origin/${branch}..HEAD`] : []),
  ]);
  return {
    url,
    fetchUrl: fetchUrl.stdout,
    branch,
    head,
    ahead: log.stdout ? log.stdout.split('\n') : [],
  };
}

export function defaultRemotePolicy(url: string): string | null {
  const match =
    /^https:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url) ??
    /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?$/i.exec(url) ??
    /^ssh:\/\/git@github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url);
  if (!match)
    return 'Só repositórios do GitHub são aceitos (https://github.com/dono/repo ou git@github.com:dono/repo).';
  if (`${match[1]}/${match[2]}`.toLowerCase() === 'thu-maic/openmaic')
    return 'Este remoto é o do OpenMAIC, não o seu repositório. Aponte o origin para o seu repositório de skills.';
  return null;
}

export async function pushBranch(
  dir: string,
  confirmedRemote: string,
  policy: RemotePolicy = defaultRemotePolicy,
  confirmedHead?: string,
): Promise<void> {
  const info = await remoteInfo(dir);
  if (!info)
    throw new AppError(
      409,
      'SEM_REMOTO',
      'Este repositório não tem um remoto "origin". Configure-o com git remote add origin <url>.',
    );
  if (redactUrl(confirmedRemote) !== redactUrl(info.url))
    throw new AppError(
      409,
      'REMOTO_DIFERENTE',
      'O remoto confirmado não é o remoto atual do repositório. Confira e confirme de novo.',
    );
  const refused = policy(info.url) ?? policy(info.fetchUrl);
  if (refused) throw new AppError(409, 'REMOTO_RECUSADO', refused);
  if (info.branch === 'HEAD')
    throw new AppError(
      409,
      'BRANCH_INVALIDA',
      'O repositório está sem branch (HEAD solta). Volte para uma branch.',
    );
  if (confirmedHead !== undefined && confirmedHead !== info.head)
    throw new AppError(
      409,
      'ESTADO_MUDOU',
      'O repositório mudou depois que você abriu a confirmação. Confira os commits e confirme de novo.',
    );
  if (!info.ahead.length)
    throw new AppError(409, 'NADA_A_ENVIAR', 'Não há commits novos para enviar.');
  const push = await run(dir, ['push', '-u', 'origin', info.branch]);
  if (push.code !== 0)
    throw fail(
      push,
      'PUSH_FALHOU',
      'O envio foi recusado pelo git. Confira seu login e permissões.',
    );
}
