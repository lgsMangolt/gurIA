import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { AppError } from './analysis';
import { TUTOR_INSTRUCTIONS } from './instructions';

export function findCodex() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (fs.existsSync(root)) {
    const choices = fs
      .readdirSync(root)
      .map((name) => path.join(root, name, 'codex.exe'))
      .filter((file) => fs.existsSync(file));
    choices.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (choices[0]) return choices[0];
  }
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(folder, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (fs.existsSync(file)) return file;
  }
  throw new AppError(
    428,
    'CODEX_MISSING',
    'Abra o Codex e entre com sua conta ChatGPT neste computador.',
  );
}

export function subscriptionGuard(account: any, data: any) {
  if (account?.type !== 'chatgpt')
    throw new AppError(
      428,
      'CHATGPT_REQUIRED',
      'O beta aceita somente o login ChatGPT do Codex. Chaves de API não são utilizadas.',
    );
  const limit = data?.rateLimitsByLimitId?.codex || data?.rateLimits;
  if (!limit || !limit.primary || !Number.isFinite(limit.primary.usedPercent))
    throw new AppError(
      503,
      'LIMIT_UNKNOWN',
      'Não foi possível confirmar a cota incluída. A análise foi pausada, sem usar créditos.',
    );
  // Refuse credit-enabled accounts: never silently consume purchased credits when a window rolls over.
  if (
    !limit.credits ||
    limit.credits.hasCredits !== false ||
    limit.credits.unlimited ||
    Number(limit.credits.balance || 0) > 0
  )
    throw new AppError(
      409,
      'CREDITS_DISABLED',
      'O beta não usa créditos extras. Não foi possível confirmar uma conta sem saldo de créditos; análise pausada.',
    );
  if (
    limit.rateLimitReachedType ||
    limit.spendControlReached ||
    [limit.primary, limit.secondary]
      .filter(Boolean)
      .some((w) => !Number.isFinite(w.usedPercent) || w.usedPercent >= 95)
  )
    throw new AppError(
      429,
      'QUOTA_EXCEEDED',
      'A cota incluída está no limite. Análise pausada; notas manuais continuam disponíveis. Aguarde a renovação da assinatura.',
    );
  return limit;
}

export function codexEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (
      /^(OPENAI_API_KEY|CODEX_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENAI_BASE_URL|OPENAI_ORG_ID|OPENAI_PROJECT_ID)$/i.test(
        key,
      )
    )
      delete env[key];
  return env;
}

export class CodexBridge {
  private child?: ChildProcessWithoutNullStreams;
  private starting?: Promise<void>;
  private sequence = 0;
  private pending = new Map<
    number,
    { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private notify?: (message: any) => void;
  private busy = false;
  constructor(private directory: string) {}
  private send(value: unknown) {
    this.child?.stdin.write(JSON.stringify(value) + '\n');
  }
  private request(method: string, params: any = {}, timeout = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new AppError(504, 'CODEX_TIMEOUT', 'O Codex demorou para responder. Tente novamente.'),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  private async start() {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const cwd = path.join(this.directory, 'codex-work');
      fs.mkdirSync(cwd, { recursive: true });
      const configs: Record<string, unknown> = {
        forced_login_method: 'chatgpt',
        model_provider: 'openai',
        service_tier: 'default',
        web_search: 'disabled',
        project_doc_max_bytes: 0,
        'skills.instructions_enabled': false,
        'features.shell_tool': false,
        'features.unified_exec': false,
        'features.apply_patch_freeform': false,
        'features.apps': false,
        'features.connectors': false,
        'features.plugins': false,
        'features.multi_agent': false,
        'features.multi_agent_v2': false,
        'features.computer_use': false,
        'features.browser_use': false,
        'features.js_repl': false,
        'features.code_mode': false,
        'features.codex_hooks': false,
        'features.plugin_hooks': false,
      };
      const configFile = path.join(
        process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
        'config.toml',
      );
      if (fs.existsSync(configFile))
        for (const match of fs
          .readFileSync(configFile, 'utf8')
          .matchAll(/^\[mcp_servers\.([\w-]+|"[^"\r\n]+"|'[^'\r\n]+')\]/gm))
          configs[`mcp_servers.${match[1]}.enabled`] = false;
      const args = [
        'app-server',
        '--stdio',
        ...Object.entries(configs).flatMap(([k, v]) => ['-c', `${k}=${JSON.stringify(v)}`]),
      ];
      const child = (this.child = spawn(findCodex(), args, {
        cwd,
        env: codexEnvironment(),
        windowsHide: true,
        stdio: 'pipe',
      }));
      // stderr may contain account metadata: never persist or relay it to the browser.
      child.stderr.resume();
      const fail = () => {
        if (this.child !== child) return;
        for (const item of this.pending.values()) {
          clearTimeout(item.timer);
          item.reject(
            new AppError(
              503,
              'CODEX_STOPPED',
              'O processo do Codex encerrou. Abra o Codex e confira o login ChatGPT.',
            ),
          );
        }
        this.pending.clear();
        this.starting = undefined;
        this.child = undefined;
        this.notify?.({ method: 'bridge/closed' });
      };
      child.once('error', fail);
      child.once('exit', fail);
      createInterface({ input: child.stdout }).on('line', (line) => {
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          return;
        }
        if (msg.id !== undefined && msg.method) {
          // No shell, file, external tool, auth-refresh or approval action is accepted by this client.
          this.send({
            id: msg.id,
            error: { code: -32601, message: 'Ferramenta não disponível neste tutor.' },
          });
          return;
        }
        const task = this.pending.get(msg.id);
        if (task) {
          this.pending.delete(msg.id);
          clearTimeout(task.timer);
          msg.error
            ? task.reject(
                new AppError(
                  502,
                  'CODEX_PROTOCOL',
                  String(msg.error.message || 'Falha no Codex').slice(0, 500),
                ),
              )
            : task.resolve(msg.result);
        } else this.notify?.(msg);
      });
      await this.request('initialize', {
        clientInfo: { name: 'openmaic_study', title: 'OpenMAIC Estudos', version: '0.2.0' },
        capabilities: { experimentalApi: false },
      });
      this.send({ method: 'initialized', params: {} });
    })();
    try {
      await this.starting;
    } catch (e) {
      this.close();
      throw e;
    }
  }
  async status() {
    await this.start();
    const account = (await this.request('account/read', { refreshToken: false })).account;
    const limits = await this.request('account/rateLimits/read');
    const limit = subscriptionGuard(account, limits);
    const catalog = await this.request('model/list', { limit: 30, includeHidden: false });
    return {
      connected: true,
      auth: 'chatgpt',
      plan: account.planType,
      usedPercent: limit.primary.usedPercent,
      resetsAt: limit.primary.resetsAt,
      models: (catalog.data || [])
        .filter((m: any) => m.inputModalities?.includes('text'))
        .map((m: any) => ({
          id: m.model,
          name: m.displayName || m.model,
          isDefault: !!m.isDefault,
        })),
    };
  }
  async generate(
    prompt: string,
    schema?: unknown,
    images: string[] = [],
    model?: string,
    options?: { signal?: AbortSignal; baseInstructions?: string },
  ): Promise<string> {
    if (options?.signal?.aborted)
      throw new AppError(499, 'CODEX_ABORTED', 'A solicitação foi cancelada.');
    if (this.busy)
      throw new AppError(
        409,
        'CODEX_BUSY',
        'O Codex está analisando outro material. Aguarde a conclusão.',
      );
    this.busy = true;
    const abort = () => this.close();
    options?.signal?.addEventListener('abort', abort, { once: true });
    let threadId: string | undefined;
    let turnTimer: NodeJS.Timeout | undefined;
    try {
      const status = await this.status(); // Fail closed on every request, not only at startup.
      if (options?.signal?.aborted)
        throw new AppError(499, 'CODEX_ABORTED', 'A solicitação foi cancelada.');
      const chosen = model || status.models.find((m: any) => m.isDefault)?.id;
      if (!chosen || !status.models.some((m: any) => m.id === chosen))
        throw new AppError(
          400,
          'MODEL_UNAVAILABLE',
          'Selecione um modelo disponível em Configurar IA.',
        );
      const created = await this.request('thread/start', {
        model: chosen,
        modelProvider: 'openai',
        cwd: path.join(this.directory, 'codex-work'),
        ephemeral: true,
        sandbox: 'read-only',
        approvalPolicy: 'never',
        serviceTier: 'default',
        baseInstructions: options?.baseInstructions || TUTOR_INSTRUCTIONS,
      });
      threadId = created.thread.id;
      if (options?.signal?.aborted)
        throw new AppError(499, 'CODEX_ABORTED', 'A solicitação foi cancelada.');
      let output = '';
      const result = new Promise<string>((resolve, reject) => {
        const timer = (turnTimer = setTimeout(
          () =>
            reject(
              new AppError(
                504,
                'CODEX_TIMEOUT',
                'A análise excedeu cinco minutos. O material fica disponível para tentar novamente.',
              ),
            ),
          300000,
        ));
        this.notify = (msg) => {
          if (msg.method === 'bridge/closed') {
            clearTimeout(timer);
            reject(new AppError(503, 'CODEX_STOPPED', 'Codex desconectado. Tente novamente.'));
          }
          if (msg.params?.threadId !== threadId) return;
          if (msg.method === 'item/completed' && msg.params.item?.type === 'agentMessage')
            output = msg.params.item.text || output;
          if (msg.method === 'turn/completed') {
            clearTimeout(timer);
            if (msg.params.turn.status !== 'completed')
              reject(
                new AppError(
                  502,
                  'CODEX_TURN_FAILED',
                  String(msg.params.turn.error?.message || 'O Codex não concluiu a análise.').slice(
                    0,
                    500,
                  ),
                ),
              );
            else if (!output)
              reject(
                new AppError(502, 'EMPTY_AI_RESPONSE', 'O Codex retornou uma resposta vazia.'),
              );
            else resolve(output);
          }
        };
      });
      // Attach rejection immediately while turn/start is in flight.
      result.catch(() => {});
      await this.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image', url }))],
        outputSchema: schema,
        effort: 'medium',
        serviceTier: 'default',
        approvalPolicy: 'never',
        sandboxPolicy: { type: 'readOnly' },
      });
      return await result;
    } finally {
      clearTimeout(turnTimer);
      options?.signal?.removeEventListener('abort', abort);
      this.notify = undefined;
      this.busy = false;
      // Each analysis owns an ephemeral session. Closing also interrupts timed-out generations.
      this.close();
    }
  }
  close() {
    const child = this.child;
    this.child = undefined;
    this.starting = undefined;
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(new AppError(503, 'CODEX_STOPPED', 'Conexão do Codex encerrada.'));
    }
    this.pending.clear();
    child?.stdin.end();
    child?.kill();
  }
}
