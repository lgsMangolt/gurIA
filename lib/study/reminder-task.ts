// Tarefa agendada do Windows que mostra o aviso de revisões vencidas (scripts/lembrete-revisoes.ps1).
// Só é criada ou removida quando o dono liga/desliga em Configurações. O comando é sempre montado
// aqui no servidor: do cliente só chega a hora, validada antes.
import { execFile } from 'node:child_process';

export type Run = (script: string) => Promise<string>;
export type ReminderStatus = { ativo: boolean; hora?: string; proxima?: string };
export type ReminderPaths = { script: string; arquivo: string; abrir: string };

const TASK = "-TaskPath '\\gurIA\\' -TaskName 'Lembrete de revisoes'";

export const validHour = (hora: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);

/** String literal do PowerShell entre aspas simples. */
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** Executa um script no Windows PowerShell sem janela, passando o texto codificado (sem aspas na linha). */
export const runPowerShell: Run = (script) =>
  new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: 30000 },
      (err, stdout, stderr) =>
        err ? reject(new Error(String(stderr || err.message).trim())) : resolve(String(stdout)),
    );
  });

const STATUS = `
$t = Get-ScheduledTask ${TASK} -ErrorAction SilentlyContinue
if (-not $t) { '{"ativo":false}'; return }
$i = $t | Get-ScheduledTaskInfo
$o = [ordered]@{ ativo = $true; hora = ([datetime]$t.Triggers[0].StartBoundary).ToString('HH:mm') }
if ($i.NextRunTime) { $o.proxima = $i.NextRunTime.ToString('s') }
$o | ConvertTo-Json -Compress`;

function scriptArgs(p: ReminderPaths, extra = '') {
  return `-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${p.script}" -Arquivo "${p.arquivo}" -Abrir "${p.abrir}"${extra}`;
}

export function reminderTaskScript(opts: ReminderPaths & { hora: string }): string {
  if (!validHour(opts.hora)) throw new Error('Hora inválida.');
  return `
$ErrorActionPreference = 'Stop'
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${q(scriptArgs(opts))}
$g = New-ScheduledTaskTrigger -Daily -At '${opts.hora}'
$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask ${TASK} -Action $a -Trigger $g -Settings $s -Description 'Aviso diario da gurIA com a contagem de revisoes vencidas.' -Force | Out-Null
${STATUS}`;
}

function parseStatus(out: string): ReminderStatus {
  const text = out.trim();
  if (!text) return { ativo: false };
  const v = JSON.parse(text) as ReminderStatus;
  return v.ativo
    ? { ativo: true, hora: v.hora, ...(v.proxima ? { proxima: v.proxima } : {}) }
    : { ativo: false };
}

export const reminderStatus = async (run: Run) => parseStatus(await run(STATUS));

export async function enableReminder(run: Run, opts: ReminderPaths & { hora: string }) {
  return parseStatus(await run(reminderTaskScript(opts)));
}

export async function disableReminder(run: Run) {
  return parseStatus(
    await run(
      `Get-ScheduledTask ${TASK} -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false\n${STATUS}`,
    ),
  );
}

export async function testReminder(
  run: Run,
  p: ReminderPaths,
): Promise<{ resultado: 'avisado' | 'nenhuma' | 'sem-resumo'; n: number }> {
  const out = (
    await run(
      `& powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${q(p.script)} -Arquivo ${q(p.arquivo)} -Abrir ${q(p.abrir)} -Testar`,
    )
  ).trim();
  const m = /^avisado:(\d+)$/.exec(out);
  if (m) return { resultado: 'avisado', n: Number(m[1]) };
  return { resultado: out === 'nenhuma' ? 'nenhuma' : 'sem-resumo', n: 0 };
}
