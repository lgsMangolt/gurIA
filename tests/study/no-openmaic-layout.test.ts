import fs from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
// "agent" só nos módulos de agente do OpenMAIC: `agentRules: false` no next.config
// é da gurIA (impede o Next de reescrever o AGENTS.md).
const FORBIDDEN =
  /@openmaic|lib\/server|lib\/persistence|lib\/adaptive|lib\/hooks|components\/ui|lib\/agent|components\/agent|agent-runtime|AgentRegistry|@earendil/i;

it.each(['app/layout.tsx', 'instrumentation.ts', 'next.config.ts'])(
  '%s não depende do OpenMAIC',
  (file) => {
    const match = read(file).match(FORBIDDEN);
    expect(match?.[0], file).toBeUndefined();
  },
);

it('o layout é da gurIA: pt-BR, título próprio e CSS global próprio', () => {
  const layout = read('app/layout.tsx');
  expect(layout).toContain('lang="pt-BR"');
  expect(layout).toContain('gurIA · Aprenda conectando ideias');
  expect(layout).toContain("import './globals.css'");
  expect(layout).not.toMatch(/Provider|Toaster|AccessCode|ProSwap|geist|katex|animate\.css/);
});

it('o CSS global não carrega Tailwind nem estilos do OpenMAIC', () => {
  const css = read('app/globals.css');
  expect(css).not.toMatch(/@import|@source|@apply|tailwind|workbench|prosemirror|maic/i);
});

it('a instrumentação só chama a partida da gurIA no Node', () => {
  const src = read('instrumentation.ts');
  expect(src).toContain("import('./lib/study/startup')");
  expect(src).not.toContain('instrumentation-node');
  expect(fs.existsSync(path.join(root, 'instrumentation-node.ts'))).toBe(false);
});
