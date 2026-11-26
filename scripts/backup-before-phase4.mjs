// Backup completo ANTES de mexer na fase 4. Só lê o banco (pg_dump) e copia arquivos.
// Uso: node scripts/backup-before-phase4.mjs
// Destino: Documents\gurIA-backup-fase4-<data>\ (recusa sobrescrever uma pasta existente).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const container = process.env.GURIA_DB_CONTAINER || 'guria-db-postgres-1';
const owner = process.env.OWNER_SINGLE_USER_ID || 'study-local';
const date = new Date().toISOString().slice(0, 10);
const target = path.join(os.homedir(), 'Documents', `gurIA-backup-fase4-${date}`);
if (fs.existsSync(target)) {
  console.error(`Já existe ${target}. Não vou sobrescrever: renomeie ou apague a pasta antiga.`);
  process.exit(1);
}
const dockerExe = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs',
  'DockerDesktop',
  'resources',
  'bin',
  'docker.exe',
);
const docker = fs.existsSync(dockerExe) ? dockerExe : 'docker';

function runToFile(args, file) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    const child = spawn(docker, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.stdout.pipe(out);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`docker saiu com ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

fs.mkdirSync(target, { recursive: true });
try {
  // 1) Banco inteiro no formato custom do pg_dump (restaurável com pg_restore).
  await runToFile(
    ['exec', container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'],
    path.join(target, 'guria-db.dump'),
  );
  // 2) O workspace em JSON legível (somente leitura).
  await runToFile(
    [
      'exec',
      container,
      'sh',
      '-c',
      `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select data from study_workspace where owner_id='${owner.replace(/[^A-Za-z0-9_-]/g, '')}'"`,
    ],
    path.join(target, 'workspace.json'),
  );
  // 3) Pasta de dados do app (configurações, jobs de mídia).
  const dataDir = path.join(process.env.LOCALAPPDATA || '', 'gurIA', 'Estudos');
  if (fs.existsSync(dataDir))
    fs.cpSync(dataDir, path.join(target, 'dados-do-app'), { recursive: true });

  // 4) Verificação: tamanhos e SHA256 de tudo.
  const lines = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name !== 'SHA256SUMS') {
        const hash = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        lines.push(`${hash}  ${path.relative(target, p).replace(/\\/g, '/')}`);
      }
    }
  };
  walk(target);
  fs.writeFileSync(path.join(target, 'SHA256SUMS'), lines.join('\n') + '\n');
  const dump = fs.statSync(path.join(target, 'guria-db.dump')).size;
  const wsSize = fs.statSync(path.join(target, 'workspace.json')).size;
  if (dump < 10_000 || wsSize < 100)
    throw new Error(`Backup suspeito: dump ${dump} bytes, workspace ${wsSize} bytes.`);
  JSON.parse(fs.readFileSync(path.join(target, 'workspace.json'), 'utf8'));
  console.log(`Backup concluído em ${target}`);
  console.log(
    `  guria-db.dump: ${dump} bytes · workspace.json: ${wsSize} bytes · ${lines.length} arquivos com SHA256`,
  );
} catch (error) {
  console.error('Falha no backup: ' + (error instanceof Error ? error.message : error));
  console.error(`A pasta parcial ${target} foi mantida para inspeção; não use este backup.`);
  process.exit(1);
}
