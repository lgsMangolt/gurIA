import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { Type } from 'typebox';
import { CodexBridge } from '../lib/study/runtime/codex';
import { createCodexProStreamFn } from '../lib/study/pro/codex-stream';
import { buildAgent } from '../lib/agent/runtime/build-agent';

export async function runProCodexProbe() {
  const env: Record<string, string> = {};
  for (const file of ['.env', '.env.local']) if (fs.existsSync(file)) Object.assign(env, parseEnv(fs.readFileSync(file, 'utf8')));
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || env.DATABASE_URL, options: '-c default_transaction_read_only=on' });
  const snapshot = async () => createHash('sha256').update(JSON.stringify((await pool.query('SELECT owner_id,revision,data,updated_at FROM study_workspace ORDER BY owner_id')).rows)).digest('hex');
  const before = await snapshot();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guria-pro-probe-'));
  const bridge = new CodexBridge(root);
  const report: Record<string, unknown> = { model: 'gpt-6-luna', startedAt: new Date().toISOString(), syntheticOnly: true, modelCalls: 0 };
  try {
    const status = await bridge.status();
    if (status.auth !== 'chatgpt' || !status.models.some((m: any) => m.id === 'gpt-6-luna')) throw new Error('Luna indisponível com a assinatura; não houve substituição.');
    report.auth = status.auth;
    console.log('Assinatura e limites confirmados; consultando ferramenta sintética.');
    const stream = createCodexProStreamFn(async ({ prompt, instructions, schema, signal }) => {
      if (Number(report.modelCalls) >= 3) throw new Error('Limite de três chamadas deste teste atingido.');
      report.modelCalls = Number(report.modelCalls) + 1;
      return bridge.generate(prompt, schema, [], 'gpt-6-luna', { signal, baseInstructions: instructions });
    });
    const model = { id: 'gpt-6-luna', api: 'openai-responses', provider: 'openai' } as any;
    let toolCalls = 0;
    const tool = { name: 'ler_conceito_sintetico', label: 'Conceito sintético', description: 'Lê um conceito sintético de lógica para este teste.', parameters: Type.Object({ id: Type.String() }, { additionalProperties: false }),
      execute: async (_id: string, args: { id: string }) => { if (args.id !== 'and') throw new Error('ID inesperado'); toolCalls++; return { content: [{ type: 'text' as const, text: 'AND só é verdadeiro quando as duas proposições são verdadeiras.' }] }; } };
    const agent = buildAgent({ streamFn: stream, model, systemPrompt: 'Para esta solicitação, primeiro chame ler_conceito_sintetico com id "and". Depois que a ferramenta responder, explique brevemente em português.', tools: [tool] as any, allowedToolNames: new Set([tool.name]) });
    await agent.prompt('Como funciona a conjunção AND?');
    if (toolCalls !== 1) throw new Error('O loop Pro não executou exatamente uma chamada sintética.');
    const final: any = agent.state.messages.at(-1);
    if (final?.role !== 'assistant' || final.stopReason !== 'stop' || !final.content.some((part: any) => part.type === 'text' && part.text)) throw new Error('O modelo não concluiu a resposta depois do resultado.');
    report.toolCalled = tool.name;
    report.response = final.content.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n');
    report.passed = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    bridge.close();
    report.workspaceUnchanged = before === await snapshot();
    if (!report.workspaceUnchanged) report.passed = false;
    await pool.end();
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync('logs/study', { recursive: true });
    fs.writeFileSync('logs/study/pro-codex-probe.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
  if (!report.passed) throw new Error(String(report.error || 'O workspace mudou durante o teste.'));
  return report;
}
