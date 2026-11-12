import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(process.env.LOCALAPPDATA, 'gurIA', 'Desktop');
fs.mkdirSync(data, { recursive: true });
const url = 'http://127.0.0.1:3033';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function health() {
  try { const r = await fetch(url + '/api/study/health', { signal: AbortSignal.timeout(5000) }); return r.ok && (await r.json()).app === 'OpenMAIC Estudos'; } catch { return false; }
}
function start(exe, args, logName, env = process.env) {
  const out = fs.openSync(path.join(data, logName + '.log'), 'a');
  const child = spawn(exe, args, { cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
  child.on('error', e => fs.appendFileSync(path.join(data, 'launcher-error.log'), e.message + '\n'));
  child.unref(); fs.closeSync(out);
}
try {
  const dockerRoot = path.join(process.env.LOCALAPPDATA, 'Programs', 'DockerDesktop');
  const docker = path.join(dockerRoot, 'resources', 'bin', 'docker.exe');
  const ready = () => { try { execFileSync(docker, ['info', '--format', '{{.ServerVersion}}'], { windowsHide: true, timeout: 5000, stdio: 'ignore' }); return true; } catch { return false; } };
  if (!ready()) start(path.join(dockerRoot, 'Docker Desktop.exe'), [], 'docker-start');
  let dockerOK = false;
  for (let i = 0; i < 60; i++) { if (ready()) { dockerOK = true; break; } await pause(2000); }
  if (!dockerOK) throw new Error('Nao foi possivel iniciar o Docker Desktop. Abra-o e tente novamente.');
  execFileSync(docker, ['compose', '-p', 'openmaic-study-db', '-f', 'docker-compose.db.yml', 'up', '-d', '--wait', '--wait-timeout', '90', 'postgres'], { cwd: root, env: { ...process.env, OPENMAIC_DB_PORT: '5440' }, windowsHide: true, timeout: 120000, stdio: 'pipe' });
  if (!await health()) {
    // A bound port belonging to another app must never be reused or terminated.
    const net = await import('node:net');
    const free = await new Promise(resolve => { const s = net.createServer(); s.on('error', () => resolve(false)); s.listen(3033, '127.0.0.1', () => s.close(() => resolve(true))); });
    if (!free) throw new Error('A porta 3033 esta ocupada ou a gurIA ainda esta iniciando. Aguarde e tente novamente.');
    start(process.execPath, ['--max-old-space-size=6144', path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3033'], 'server');
  }
  let appOK = false;
  for (let i = 0; i < 90; i++) { if (await health()) { appOK = true; break; } await pause(2000); }
  if (!appOK) throw new Error('A gurIA demorou para iniciar. Confira os logs em ' + data);
  if (!process.argv.includes('--check')) {
    const edge = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(p => path.join(p, 'Microsoft', 'Edge', 'Application', 'msedge.exe')).find(p => fs.existsSync(p));
    if (!edge) throw new Error('Microsoft Edge nao encontrado neste computador.');
    const child = spawn(edge, ['--app=' + url + '/study', '--user-data-dir=' + path.join(data, 'BrowserProfile'), '--no-first-run', '--no-default-browser-check'], { cwd: root, detached: true, stdio: 'ignore' });
    child.unref();
  }
  console.log('gurIA desktop pronta.');
} catch (e) {
  fs.appendFileSync(path.join(data, 'launcher-error.log'), new Date().toISOString() + ' ' + e.message + '\n');
  console.error(e.message); process.exitCode = 1;
}
