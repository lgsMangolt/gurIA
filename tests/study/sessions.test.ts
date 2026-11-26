import { describe, expect, it } from 'vitest';
import { emptyWorkspace, studyModes, workspaceSchema, type Workspace } from '@/lib/study/domain';
import { sessionModes } from '@/lib/study/sessions/session-schema';
import {
  KEEP_ENDED_SESSIONS,
  PROVA_TOLERANCE_MS,
  SESSION_IDLE_MS,
  activeSession,
  createSession,
  expireStale,
  finishSession,
  markAnswered,
  pruneSessions,
} from '@/lib/study/sessions/session';
import { buildDemoWorkspace } from '../../scripts/readme-demo/fixture';

const T0 = new Date(2026, 10, 10, 12).getTime();
const MIN = 60000;
const items = [
  { conceptId: 'c1', exerciseId: 'e1' },
  { conceptId: 'c1', exerciseId: 'e2' },
];
const start = (ws: Workspace, id = 's1', mode: 'rapido' | 'prova' = 'rapido', now = T0) =>
  createSession(ws, {
    id,
    mode,
    items,
    now,
    ...(mode === 'prova' ? { limitMinutes: 10 } : {}),
  });
const code = (c: string) => expect.objectContaining({ code: c });

describe('sessão de estudo', () => {
  it('os modos do schema acompanham os modos do domínio', () => {
    expect([...sessionModes]).toEqual([...studyModes]);
  });
  it('createSession cria ativa, define o prazo só na Prova e é idempotente por id', () => {
    const r = start(emptyWorkspace());
    expect(r.studySessions[0]).toMatchObject({
      id: 's1',
      mode: 'rapido',
      state: 'ativa',
      startedAt: T0,
    });
    expect(r.studySessions[0].deadlineAt).toBeUndefined();
    expect(start(r).studySessions).toHaveLength(1);
    const p = start(emptyWorkspace(), 'p', 'prova');
    expect(p.studySessions[0]).toMatchObject({ deadlineAt: T0 + 10 * MIN, limitMinutes: 10 });
  });
  it('uma segunda sessão ativa é recusada, mas outra é aceita depois de encerrar a primeira', () => {
    const r = start(emptyWorkspace());
    expect(() => start(r, 's2')).toThrow(code('SESSAO_ATIVA'));
    const done = finishSession(r, 's1', T0 + MIN);
    expect(start(done, 's2', 'rapido', T0 + 2 * MIN).studySessions).toHaveLength(2);
  });
  it('sessão esquecida aberta expira sozinha por inatividade e libera uma nova', () => {
    const r = start(emptyWorkspace());
    const later = T0 + SESSION_IDLE_MS + 1;
    expect(activeSession(r, later)).toBeUndefined();
    const created = start(r, 's2', 'rapido', later);
    expect(created.studySessions.find((s) => s.id === 's1')).toMatchObject({
      state: 'expirada',
      endedAt: later,
    });
    expect(activeSession(created, later)?.id).toBe('s2');
  });
  it('Prova expira depois do prazo + tolerância, e dentro da tolerância ainda aceita', () => {
    const p = start(emptyWorkspace(), 'p', 'prova');
    const limit = T0 + 10 * MIN + PROVA_TOLERANCE_MS;
    expect(() => markAnswered(p, 'p', 'c1', 'e1', limit)).not.toThrow();
    expect(() => markAnswered(p, 'p', 'c1', 'e1', limit + 1)).toThrow(code('PROVA_ENCERRADA'));
    expect(expireStale(p, limit).studySessions[0].state).toBe('ativa');
    expect(expireStale(p, limit + 1).studySessions[0].state).toBe('expirada');
  });
  it('markAnswered recusa item respondido, item de fora e sessão encerrada', () => {
    const r = start(emptyWorkspace());
    const a = markAnswered(r, 's1', 'c1', 'e1', T0 + MIN);
    expect(a.studySessions[0].items[0].answeredAt).toBe(T0 + MIN);
    expect(() => markAnswered(a, 's1', 'c1', 'e1', T0 + 2 * MIN)).toThrow(
      code('ITEM_JA_RESPONDIDO'),
    );
    expect(() => markAnswered(a, 's1', 'c1', 'zz', T0 + 2 * MIN)).toThrow(
      code('ITEM_FORA_DA_SESSAO'),
    );
    expect(() => markAnswered(a, 'nao', 'c1', 'e2', T0 + 2 * MIN)).toThrow(
      code('SESSAO_INEXISTENTE'),
    );
    const done = finishSession(a, 's1', T0 + 3 * MIN);
    expect(() => markAnswered(done, 's1', 'c1', 'e2', T0 + 4 * MIN)).toThrow(
      code('SESSAO_ENCERRADA'),
    );
  });
  it('finishSession é idempotente e recusa sessão inexistente', () => {
    const done = finishSession(start(emptyWorkspace()), 's1', T0 + MIN);
    expect(done.studySessions[0]).toMatchObject({ state: 'encerrada', endedAt: T0 + MIN });
    expect(finishSession(done, 's1', T0 + 9 * MIN)).toEqual(done);
    expect(() => finishSession(done, 'nao', T0)).toThrow(code('SESSAO_INEXISTENTE'));
  });
  it('pruneSessions mantém as ativas e só as 50 encerradas mais recentes', () => {
    const base = start(emptyWorkspace(), 'ativa');
    const ended = Array.from({ length: KEEP_ENDED_SESSIONS + 10 }, (_, i) => ({
      id: 'e' + i,
      mode: 'rapido' as const,
      state: 'encerrada' as const,
      startedAt: i,
      endedAt: i + 1,
      items,
    }));
    const pruned = pruneSessions({ ...base, studySessions: [...ended, ...base.studySessions] });
    expect(pruned.studySessions.filter((s) => s.state === 'encerrada')).toHaveLength(
      KEEP_ENDED_SESSIONS,
    );
    expect(pruned.studySessions.some((s) => s.id === 'ativa')).toBe(true);
    expect(pruned.studySessions.some((s) => s.id === 'e0')).toBe(false);
  });
  it('workspace antigo sem studySessions continua válido', () => {
    expect(workspaceSchema.parse(buildDemoWorkspace()).studySessions).toEqual([]);
  });
});
