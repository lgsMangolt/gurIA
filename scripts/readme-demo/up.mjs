// Sobe o ambiente isolado de demonstração: Postgres 5441 + app 3034 + dados sintéticos.
// Nunca usa 3033/5440 (instalação pessoal). Para parar: encerre o node que escuta a porta 3034 e rode
// `docker compose -p guria-readme-db -f docker-compose.db.yml stop postgres`.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_PORT = 5441;
const APP_PORT = 3034;
const url = `http://127.0.0.1:${APP_PORT}`;
const env = {
  ...process.env,
  OPENMAIC_DB_PORT: String(DB_PORT),
  DATABASE_URL: `postgres://openmaic:openmaic-dev@127.0.0.1:${DB_PORT}/openmaic`,
  OWNER_SINGLE_USER: 'true',
  OWNER_SINGLE_USER_ID: 'readme-demo',
  GURIA_LOCAL: 'true',
  NEXT_TELEMETRY_DISABLED: '1',
  // Pasta de build própria: o Next trava a pasta .next, que o app pessoal usa.
  GURIA_NEXT_DIST_DIR: '.next-readme-demo',
};
if (APP_PORT === 3033 || DB_PORT === 5440) throw new Error('Portas pessoais não são permitidas.');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const free = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.on('error', () => resolve(false));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
  });
async function health() {
  try {
    const r = await fetch(url + '/api/study/health', { signal: AbortSignal.timeout(5000) });
    return r.ok && ['gurIA', 'OpenMAIC Estudos'].includes((await r.json()).app);
  } catch {
    return false;
  }
}
const docker = fs.existsSync(path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe'))
  ? path.join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin', 'docker.exe')
  : 'docker';

execFileSync(docker, ['compose', '-p', 'guria-readme-db', '-f', 'docker-compose.db.yml', 'up', '-d', '--wait', '--wait-timeout', '90', 'postgres'], { cwd: root, env, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), path.join('scripts', 'readme-demo', 'seed.ts')], { cwd: root, env, stdio: 'inherit' });

if (!(await health())) {
  if (!(await free(APP_PORT))) throw new Error(`A porta ${APP_PORT} está ocupada por outro programa.`);
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  const log = fs.openSync(path.join(root, 'logs', 'readme-demo.log'), 'a');
  const child = spawn(process.execPath, ['--max-old-space-size=4096', path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(APP_PORT)], { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  child.unref();
}
for (let i = 0; i < 90; i++) {
  if (await health()) {
    console.log(`Demo pronta em ${url}/study`);
    process.exit(0);
  }
  await pause(2000);
}
throw new Error('A demo demorou para iniciar. Veja logs/readme-demo.log');
