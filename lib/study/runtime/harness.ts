import fs from 'node:fs';
import { TUTOR_INSTRUCTIONS } from './instructions';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AppError } from './analysis';

export type HarnessId = 'codex' | 'claude';
export type Selection = { harness: HarnessId; model: string };
export type HarnessStatus = {
  connected: boolean;
  auth?: string;
  plan?: string;
  usedPercent?: number;
  error?: string;
  models: Array<{ id: string; name: string; isDefault: boolean }>;
};
export interface Harness {
  status(): Promise<HarnessStatus>;
  generate(prompt: string, schema?: unknown, images?: string[], model?: string): Promise<string>;
}
export const harnessNames = { codex: 'Codex · ChatGPT', claude: 'Claude Code · Claude' };
const fail = (message: string) => new AppError(428, 'SUBSCRIPTION_REQUIRED', message);

export function subscriptionEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /^(ANTHROPIC_|CLAUDE_CODE_|CLAUDE_CONFIG_DIR|CLAUDECODE$|CLAUDE_AGENT_|OPENAI_|CODEX_API_|GEMINI_|GOOGLE_|COPILOT_|GITHUB_COPILOT_|GITHUB_TOKEN$|GH_TOKEN$|GH_HOST$|AWS_|AZURE_|NODE_OPTIONS$)/i.test(
        key,
      )
    )
      delete env[key];
  }
  return {
    ...env,
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    DISABLE_AUTOUPDATER: '1',
    DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_EXTRA_USAGE_COMMAND: '1',
  };
}
export function findHarness(name: 'claude') {
  const folders = [
    path.join(os.homedir(), '.local', 'bin'),
    ...(process.env.PATH || '').split(path.delimiter),
  ];
  for (const folder of folders) {
    const file = path.join(folder, process.platform === 'win32' ? `${name}.exe` : name);
    if (fs.existsSync(file)) return file;
  }
  throw fail(
    `${name} não está instalado. Instale o CLI oficial e entre com sua assinatura existente.`,
  );
}
export function runHarness(exe: string, args: string[], cwd: string, input = '', timeout = 300000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      windowsHide: true,
      env: subscriptionEnvironment(),
      stdio: 'pipe',
    });
    let output = '',
      oversized = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(fail('O harness excedeu o tempo limite. Tente novamente.'));
    }, timeout);
    child.stdout.on('data', (data) => {
      output += data;
      if (output.length > 8000000) {
        oversized = true;
        child.kill();
      }
    });
    // Never return CLI diagnostics: they may include account data or supplied material.
    child.stderr.resume();
    child.on('error', () => {
      clearTimeout(timer);
      reject(fail('Não foi possível iniciar o harness local.'));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || oversized)
        reject(
          fail(
            'O harness não concluiu a solicitação. Confira login e cota no CLI; nenhum outro serviço foi acionado.',
          ),
        );
      else resolve(output);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export function claudeAuthGuard(auth: any) {
  if (
    auth?.loggedIn !== true ||
    auth.authMethod !== 'claude.ai' ||
    auth.apiProvider !== 'firstParty' ||
    !['pro', 'max', 'team', 'enterprise'].includes(auth.subscriptionType)
  )
    throw fail('Entre no Claude Code com sua assinatura Claude. Chaves de API não são aceitas.');
}
export function claudeGuard(auth: any, usage: any) {
  claudeAuthGuard(auth);
  if (usage?.extra_usage?.is_enabled !== false)
    throw fail(
      'Claude pausado: não foi possível confirmar que o uso extra está desativado. Confira Uso nas configurações da conta Claude.',
    );
  const windows = [usage?.five_hour, usage?.seven_day];
  // Claude may expose an additional limit for Sonnet/Opus/OAuth applications.
  // Null optional windows are not applicable; malformed present windows fail closed.
  for (const [key, value] of Object.entries(usage || {}))
    if (/^(five_hour|seven_day)_/.test(key) && value !== null && value !== undefined)
      windows.push(value);
  if (
    windows.some(
      (w) => !Number.isFinite(w?.utilization) || w.utilization < 0 || w.utilization >= 95,
    )
  )
    throw fail('Claude pausado: cota incluída desconhecida ou próxima do limite.');
  return Math.max(...windows.map((w) => w.utilization));
}
export const claudeArgs = () => [
  '--restricted',
  '--safe-mode',
  '--setting-sources',
  '',
  '--settings',
  JSON.stringify({ forcedLoginMethod: 'claudeai', disableAllHooks: true }),
  '--strict-mcp-config',
  '--mcp-config',
  '{"mcpServers":{}}',
  '--tools',
  '',
  '--disable-slash-commands',
  '--no-chrome',
  '--permission-mode',
  'dontAsk',
];
export function claudeMessage(prompt: string, images: string[]) {
  return (
    JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map((url) => {
            const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
            if (!match) throw new Error('Imagem inválida.');
            return {
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            };
          }),
        ],
      },
    }) + '\n'
  );
}
export function claudeResult(text: string) {
  let values: any[];
  try {
    values = text
      .trim()
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    throw fail('Claude retornou uma resposta em formato inválido.');
  }
  const value = values.findLast((v) => v?.type === 'result');
  if (!value || value.is_error || value.subtype !== 'success')
    throw fail('Claude não concluiu a resposta estruturada.');
  if (value.structured_output !== undefined && value.structured_output !== null)
    return JSON.stringify(value.structured_output);
  if (typeof value.result === 'string' && value.result.trim()) return value.result;
  throw fail('Claude retornou uma resposta vazia.');
}
export class ClaudeBridge implements Harness {
  private busy = false;
  private directory: string;
  constructor(root: string) {
    this.directory = path.join(root, 'claude-work');
    fs.mkdirSync(this.directory, { recursive: true });
  }
  async status() {
    const auth = JSON.parse(
      await runHarness(
        findHarness('claude'),
        [...claudeArgs(), 'auth', 'status', '--json'],
        this.directory,
        '',
        30000,
      ),
    );
    claudeAuthGuard(auth);
    let token = '';
    try {
      token = JSON.parse(
        fs.readFileSync(path.join(os.homedir(), '.claude', '.credentials.json'), 'utf8'),
      ).claudeAiOauth.accessToken;
    } catch {}
    if (typeof token !== 'string' || !token)
      throw fail('Não foi possível verificar a cota OAuth do Claude neste computador.');
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw fail('Não foi possível consultar a cota Claude. Abra o CLI para renovar o login.');
    const usedPercent = claudeGuard(auth, await response.json());
    return {
      connected: true,
      auth: 'claude.ai',
      plan: auth.subscriptionType,
      usedPercent,
      // CLI aliases; an unavailable model fails without a fallback model.
      models: [
        { id: 'sonnet', name: 'Sonnet (alias do CLI)', isDefault: true },
        { id: 'opus', name: 'Opus (alias do CLI)', isDefault: false },
        { id: 'haiku', name: 'Haiku (alias do CLI)', isDefault: false },
      ],
    };
  }
  async generate(prompt: string, schema?: unknown, images: string[] = [], model = 'sonnet') {
    if (this.busy) throw fail('Claude está ocupado com outro material. Aguarde.');
    this.busy = true;
    try {
      const status = await this.status();
      model ||= 'sonnet';
      if (!status.models.some((m) => m.id === model)) throw fail('Modelo Claude indisponível.');
      const args = [
        ...claudeArgs(),
        '-p',
        '--no-session-persistence',
        '--model',
        model,
        '--effort',
        'medium',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--system-prompt',
        TUTOR_INSTRUCTIONS,
      ];
      if (schema) args.push('--json-schema', JSON.stringify(schema));
      return claudeResult(
        await runHarness(
          findHarness('claude'),
          args,
          this.directory,
          claudeMessage(prompt, images),
        ),
      );
    } finally {
      this.busy = false;
    }
  }
}
