import { describe, expect, it } from 'vitest';
import { mastery, validateReferences, workspaceSchema } from '@/lib/study/domain';
import { eligibleConcepts, explainIneligible } from '@/lib/study/skills/eligible';
import { graphStatus } from '@/lib/study/graph-status';
import { buildDemoWorkspace } from '../../scripts/readme-demo/fixture';

const NOW = Date.UTC(2026, 10, 17, 12);

describe('fixture sintético do README', () => {
  it('passa em workspaceSchema e validateReferences', () => {
    const data = buildDemoWorkspace(NOW);
    expect(() => validateReferences(workspaceSchema.parse(data))).not.toThrow();
  });

  it('tem cursos, conceitos, conexões, sessões e revisões suficientes para as telas', () => {
    const data = buildDemoWorkspace(NOW);
    expect(data.courses.length).toBeGreaterThanOrEqual(2);
    expect(data.concepts.length).toBeGreaterThanOrEqual(12);
    expect(data.connections.length).toBeGreaterThanOrEqual(10);
    expect(data.sessions.length).toBeGreaterThanOrEqual(3);
    expect(data.concepts.some((c) => c.due > 0)).toBe(true);
  });

  it('mostra os quatro estados de aprendizagem na rede', () => {
    const data = buildDemoWorkspace(NOW);
    const states = new Set(data.concepts.map((c) => graphStatus(c, NOW)));
    expect([...states].sort()).toEqual(['learning', 'mastered', 'new', 'review']);
  });

  it('não contém caminhos de usuário nem e-mails', () => {
    const text = JSON.stringify(buildDemoWorkspace(NOW));
    expect(text).not.toMatch(/C:\\\\Users|AppData|@[a-z0-9.-]+\.[a-z]+/i);
  });

  it('tem exercícios dos quatro tipos em pelo menos dois conceitos', () => {
    const data = workspaceSchema.parse(buildDemoWorkspace(NOW));
    const types = (c: (typeof data.concepts)[number]) => new Set(c.exercises.map((e) => e.type));
    const full = data.concepts.filter((c) => types(c).size === 4);
    expect(full.length).toBeGreaterThanOrEqual(2);
  });

  it('todas as tentativas da demo têm helped false', () => {
    const data = buildDemoWorkspace(NOW);
    for (const c of data.concepts) for (const a of c.attempts) expect(a.helped).toBe(false);
  });

  it('os conceitos dominados da demo respeitam a regra nova', () => {
    const data = workspaceSchema.parse(buildDemoWorkspace(NOW));
    const mastered = data.concepts.filter((c) => graphStatus(c, NOW) === 'mastered');
    expect(mastered.length).toBeGreaterThanOrEqual(2);
    for (const c of mastered) {
      const m = mastery(c);
      expect(m.mastered).toBe(true);
      expect(m.evidenceCount).toBeGreaterThanOrEqual(2);
    }
  });

  it('a demo tem pelo menos 4 conceitos dominados elegíveis para skill', () => {
    const data = workspaceSchema.parse(buildDemoWorkspace(NOW));
    expect(eligibleConcepts(data).length).toBeGreaterThanOrEqual(4);
  });

  it('a demo tem conceitos em estudo que não são elegíveis', () => {
    const data = workspaceSchema.parse(buildDemoWorkspace(NOW));
    const eligible = new Set(eligibleConcepts(data).map((c) => c.id));
    const studying = data.concepts.filter((c) => c.attempts.length && !eligible.has(c.id));
    expect(studying.length).toBeGreaterThanOrEqual(2);
    for (const c of studying) expect(explainIneligible(c)).toMatch(/Em estudo/);
  });

  it('a fixture não traz mediaUrl, caminhos nem e-mails', () => {
    const data = buildDemoWorkspace(NOW);
    for (const c of data.concepts) for (const e of c.evidence) expect(e.mediaUrl).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(
      /mediaUrl|C:\Users|\/home\/|\/Users\/|@[a-z0-9.-]+\.[a-z]+/i,
    );
  });
});
