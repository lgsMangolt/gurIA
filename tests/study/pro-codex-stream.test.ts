import { describe, expect, it, vi } from 'vitest';
import { Type } from 'typebox';
import { createCodexProStreamFn } from '@/lib/study/pro/codex-stream';
import { buildAgent } from '@/lib/agent/runtime/build-agent';

const model = { id: 'gpt-6-luna', api: 'openai-responses', provider: 'openai' } as any;
const tools = [{ name: 'ler_conceito', description: 'Lê um conceito', parameters: Type.Object({ id: Type.String() }, { additionalProperties: false }) }];
const context = { systemPrompt: 'Ajude a estudar.', tools, messages: [{ role: 'user', content: 'Leia o conceito.', timestamp: 1 }] } as any;
const output = (response: string, toolName = '', toolArgumentsJson = '') => JSON.stringify({ response, toolName, toolArgumentsJson });
async function collect(stream: any) { const events = []; for await (const event of stream) events.push(event); return { events, result: await stream.result() }; }

describe('adaptador experimental do Codex para o Pro', () => {
  it('integra o loop real do Pro: executa a ferramenta sintética e continua a conversa', async () => {
    const generate = vi.fn().mockResolvedValueOnce(output('', 'ler_conceito', '{"id":"synthetic"}')).mockResolvedValueOnce(output('AND exige duas proposições verdadeiras.'));
    const execute = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'AND exige ambas verdadeiras.' }] });
    const agent = buildAgent({ streamFn: createCodexProStreamFn(generate), model, systemPrompt: 'Ajude a estudar.', tools: [{ ...tools[0], label: 'Conceito', execute }] as any, allowedToolNames: new Set(['ler_conceito']) });
    await agent.prompt('Leia o conceito.');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(agent.state.messages.some((message: any) => message.role === 'toolResult' && message.toolName === 'ler_conceito')).toBe(true);
    expect(agent.state.messages.at(-1)).toMatchObject({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'AND exige duas proposições verdadeiras.' }] });
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('entrega a chamada ao loop anfitrião e continua depois com o resultado', async () => {
    const generate = vi.fn().mockResolvedValueOnce(output('', 'ler_conceito', '{"id":"synthetic"}')).mockResolvedValueOnce(output('O conceito descreve uma conjunção.'));
    const stream = createCodexProStreamFn(generate);
    const first = await collect(stream(model, context));
    expect(first.result.stopReason).toBe('toolUse');
    const call = first.result.content[0];
    expect(call).toMatchObject({ type: 'toolCall', name: 'ler_conceito', arguments: { id: 'synthetic' } });
    expect(first.events.map((e: any) => e.type)).toEqual(['start', 'toolcall_start', 'toolcall_end', 'done']);
    const second = await collect(stream(model, { ...context, messages: [...context.messages, first.result, { role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text: 'AND exige ambas verdadeiras.' }], isError: false, timestamp: 2 }] }));
    expect(second.result).toMatchObject({ stopReason: 'stop', content: [{ type: 'text', text: 'O conceito descreve uma conjunção.' }] });
    expect(generate.mock.calls[1][0].prompt).toContain('AND exige ambas verdadeiras.');
  });
  it.each([
    ['unknown tool', output('', 'apagar_tudo', '{}')],
    ['invalid arguments', output('', 'ler_conceito', '{"id":42}')],
    ['unexpected field', '{"response":"","toolName":"","toolArgumentsJson":"","extra":true}'],
    ['malformed JSON', '{'],
  ])('recusa %s sem entregar chamada de ferramenta', async (_name, raw) => {
    const result = await collect(createCodexProStreamFn(vi.fn().mockResolvedValue(raw))(model, context));
    expect(result.result.stopReason).toBe('error');
    expect(result.result.content).toEqual([]);
    expect(result.events.some((e: any) => e.type === 'toolcall_end')).toBe(false);
  });
  it('recusa contexto excessivo e imagens antes de consultar o modelo', async () => {
    const generate = vi.fn();
    const fn = createCodexProStreamFn(generate);
    const tooLong = await collect(fn(model, { ...context, messages: [{ role: 'user', content: 'x'.repeat(200001), timestamp: 1 }] }));
    const image = await collect(fn(model, { ...context, messages: [{ role: 'user', content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }], timestamp: 1 }] }));
    expect(tooLong.result.stopReason).toBe('error');
    expect(image.result.stopReason).toBe('error');
    expect(generate).not.toHaveBeenCalled();
  });
  it('interrompe uma solicitação já cancelada antes da geração', async () => {
    const controller = new AbortController(); controller.abort();
    const generate = vi.fn();
    const result = await collect(createCodexProStreamFn(generate)(model, context, { signal: controller.signal }));
    expect(result.result.stopReason).toBe('aborted');
    expect(generate).not.toHaveBeenCalled();
  });
});
