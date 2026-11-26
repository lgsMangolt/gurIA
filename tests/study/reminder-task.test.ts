import { describe, expect, it } from 'vitest';
import {
  disableReminder,
  enableReminder,
  reminderStatus,
  reminderTaskScript,
  testReminder,
  validHour,
  type Run,
} from '@/lib/study/reminder-task';

const paths = {
  script: 'C:\\gurIA\\scripts\\lembrete-revisoes.ps1',
  arquivo: "C:\\Users\\O'Neil\\AppData\\Local\\gurIA\\Estudos\\abc\\lembrete-revisoes.json",
  abrir: 'file:///C:/Users/O%27Neil/gurIA.lnk',
};
function fake(stdout = '') {
  const calls: string[] = [];
  const run: Run = async (script) => {
    calls.push(script);
    return stdout;
  };
  return { calls, run };
}

describe('tarefa agendada do lembrete', () => {
  it('aceita só HH:MM de 00:00 a 23:59', () => {
    for (const ok of ['00:00', '07:05', '19:00', '23:59']) expect(validHour(ok)).toBe(true);
    for (const bad of ['25:00', '7:00', '19:60', '19:00; rm', "19:00'", ''])
      expect(validHour(bad)).toBe(false);
  });

  it('o script de registro tem o horário, o "executar quando disponível" e caminhos escapados', () => {
    const ps = reminderTaskScript({ hora: '19:30', ...paths });
    expect(ps).toContain("-At '19:30'");
    expect(ps).toContain('-StartWhenAvailable');
    expect(ps).toContain("-TaskPath '\\gurIA\\'");
    // A aspa simples do caminho vira duas dentro da string do PowerShell.
    expect(ps).toContain("O''Neil\\AppData");
    expect(ps).toContain('-WindowStyle Hidden');
    expect(() => reminderTaskScript({ hora: '25:00', ...paths })).toThrow();
  });

  it('ligar registra a tarefa; hora inválida não chega ao PowerShell', async () => {
    const f = fake('{"ativo":true,"hora":"19:30","proxima":"2026-11-24T19:30:00"}');
    expect(await enableReminder(f.run, { hora: '19:30', ...paths })).toEqual({
      ativo: true,
      hora: '19:30',
      proxima: '2026-11-24T19:30:00',
    });
    expect(f.calls[0]).toContain('Register-ScheduledTask');
    const g = fake();
    await expect(enableReminder(g.run, { hora: '7:00; rm', ...paths })).rejects.toThrow();
    expect(g.calls).toEqual([]);
  });

  it('desligar remove a tarefa', async () => {
    const f = fake('{"ativo":false}');
    expect(await disableReminder(f.run)).toEqual({ ativo: false });
    expect(f.calls[0]).toContain('Unregister-ScheduledTask');
  });

  it('o status lê a tarefa e tolera saída vazia', async () => {
    expect(await reminderStatus(fake('{"ativo":false}').run)).toEqual({ ativo: false });
    expect(await reminderStatus(fake('').run)).toEqual({ ativo: false });
  });

  it('testar roda o script do aviso e devolve o resultado', async () => {
    expect(await testReminder(fake('avisado:3\r\n').run, paths)).toEqual({
      resultado: 'avisado',
      n: 3,
    });
    expect(await testReminder(fake('nenhuma').run, paths)).toEqual({ resultado: 'nenhuma', n: 0 });
    expect(await testReminder(fake('sem-resumo').run, paths)).toEqual({
      resultado: 'sem-resumo',
      n: 0,
    });
  });
});
